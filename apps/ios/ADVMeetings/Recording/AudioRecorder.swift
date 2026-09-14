import AVFoundation
import Foundation
import os

/// Запись с микрофона через AVAudioEngine с ротацией файлов-сегментов без остановки движка.
/// Выход: AAC 16 кГц mono 32 kbps в .m4a. Работает в фоне и при заблокированном экране (UIBackgroundModes: audio).
final class AudioRecorder {
    enum State: Equatable { case idle, recording, paused, interrupted }

    struct ClosedSegment { let seq: Int; let url: URL; let durationSec: Double; let sizeBytes: Int }

    private let log = Logger(subsystem: "kz.adv.meetings", category: "recorder")
    private let engine = AVAudioEngine()
    private let writerQueue = DispatchQueue(label: "kz.adv.meetings.audio-writer", qos: .userInitiated)

    private let outputFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16_000, channels: 1, interleaved: false)!
    private let fileSettings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: 16_000,
        AVNumberOfChannelsKey: 1,
        AVEncoderBitRateKey: 32_000,
        AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
    ]

    private var converter: AVAudioConverter?
    private var inputFormat: AVAudioFormat?
    private var file: AVAudioFile?
    private var fileURL: URL?
    private var framesInFile: AVAudioFramePosition = 0
    private var segmentFrames: AVAudioFramePosition
    private var directory: URL?
    private(set) var currentSeq = 0
    private(set) var state: State = .idle
    private(set) var totalFrames: AVAudioFramePosition = 0

    /// Вызывается (не на главном потоке) при закрытии сегмента
    var onSegmentClosed: ((ClosedSegment) -> Void)?
    /// Уровень сигнала 0…1 (не на главном потоке, ~10 раз/с)
    var onLevel: ((Float) -> Void)?
    var onStateChanged: ((State) -> Void)?

    private var levelAccumulator: (sum: Float, count: Int) = (0, 0)

    init(segmentDuration: TimeInterval = AppConfig.segmentDuration) {
        segmentFrames = AVAudioFramePosition(segmentDuration * 16_000)
        NotificationCenter.default.addObserver(self, selector: #selector(configurationChanged), name: .AVAudioEngineConfigurationChange, object: engine)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    var recordedSeconds: Double { Double(totalFrames) / 16_000 }

    // MARK: Session

    static func configureSession() throws {
        let s = AVAudioSession.sharedInstance()
        // Встроенный микрофон (без HFP-гарнитуры): для записи встречи «телефон на столе» это лучший источник.
        try s.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .allowBluetoothA2DP, .defaultToSpeaker])
        try s.setPreferredSampleRate(48_000)
        try s.setPreferredIOBufferDuration(0.02)
        try s.setActive(true, options: [])
    }

    // MARK: Control

    func start(in directory: URL, startingSeq: Int = 0) throws {
        guard state == .idle else { return }
        self.directory = directory
        currentSeq = startingSeq
        try Self.configureSession()
        try installTap()
        try openNextFile()
        engine.prepare()
        try engine.start()
        setState(.recording)
        log.info("recording started, seq=\(self.currentSeq)")
    }

    func pause() {
        guard state == .recording else { return }
        engine.pause()
        setState(.paused)
    }

    func resume() throws {
        guard state == .paused || state == .interrupted else { return }
        try Self.configureSession()
        if !engine.isRunning { try engine.start() }
        setState(.recording)
    }

    func markInterrupted() {
        guard state == .recording else { return }
        engine.pause()
        setState(.interrupted)
    }

    /// Останавливает запись и закрывает последний сегмент.
    func stop() {
        guard state != .idle else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        writerQueue.sync { closeCurrentFile() }
        converter = nil
        setState(.idle)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        log.info("recording stopped, total=\(self.recordedSeconds)s")
    }

    // MARK: Engine plumbing

    private func installTap() throws {
        let input = engine.inputNode
        let fmt = input.outputFormat(forBus: 0)
        guard fmt.sampleRate > 0, fmt.channelCount > 0 else { throw NSError(domain: "AudioRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "Микрофон недоступен"]) }
        inputFormat = fmt
        guard let conv = AVAudioConverter(from: fmt, to: outputFormat) else { throw NSError(domain: "AudioRecorder", code: 2, userInfo: [NSLocalizedDescriptionKey: "Не удалось создать конвертер аудио"]) }
        conv.sampleRateConverterQuality = .max
        converter = conv
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 4096, format: fmt) { [weak self] buffer, _ in
            self?.handle(buffer: buffer)
        }
    }

    @objc private func configurationChanged(_ n: Notification) {
        // Смена маршрута (наушники, AirPods): формат входа мог измениться — переустанавливаем tap и перезапускаем движок.
        log.warning("engine configuration changed")
        guard state == .recording else { return }
        do {
            try installTap()
            if !engine.isRunning { try engine.start() }
        } catch {
            log.error("reinstall tap failed: \(error.localizedDescription)")
            setState(.interrupted)
        }
    }

    private func handle(buffer: AVAudioPCMBuffer) {
        guard let converter, state == .recording else { return }
        measureLevel(buffer)
        let ratio = outputFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 64
        guard let out = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else { return }
        var consumed = false
        var err: NSError?
        let status = converter.convert(to: out, error: &err) { _, outStatus in
            if consumed { outStatus.pointee = .noDataNow; return nil }
            consumed = true
            outStatus.pointee = .haveData
            return buffer
        }
        if status == .error { log.error("convert error: \(err?.localizedDescription ?? "?")"); return }
        guard out.frameLength > 0 else { return }
        writerQueue.async { [weak self] in self?.write(out) }
    }

    private func write(_ buffer: AVAudioPCMBuffer) {
        do {
            if file == nil { try openNextFile() }
            try file?.write(from: buffer)
            framesInFile += AVAudioFramePosition(buffer.frameLength)
            totalFrames += AVAudioFramePosition(buffer.frameLength)
            if framesInFile >= segmentFrames {
                closeCurrentFile()
                try openNextFile()
            }
        } catch {
            log.error("write failed: \(error.localizedDescription)")
        }
    }

    private func openNextFile() throws {
        guard let directory else { return }
        let url = directory.appending(path: String(format: "%04d.m4a", currentSeq))
        file = try AVAudioFile(forWriting: url, settings: fileSettings, commonFormat: .pcmFormatFloat32, interleaved: false)
        try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
        fileURL = url
        framesInFile = 0
    }

    private func closeCurrentFile() {
        guard let url = fileURL else { return }
        let frames = framesInFile
        file = nil // закрытие файла — запись заголовков m4a
        fileURL = nil
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
        let seq = currentSeq
        currentSeq += 1
        framesInFile = 0
        if frames > 0 {
            onSegmentClosed?(ClosedSegment(seq: seq, url: url, durationSec: Double(frames) / 16_000, sizeBytes: size))
        } else {
            try? FileManager.default.removeItem(at: url)
        }
    }

    private func measureLevel(_ buffer: AVAudioPCMBuffer) {
        guard let ch = buffer.floatChannelData?[0] else { return }
        let n = Int(buffer.frameLength)
        guard n > 0 else { return }
        var sum: Float = 0
        for i in 0..<n { sum += ch[i] * ch[i] }
        let rms = sqrt(sum / Float(n))
        let db = 20 * log10(max(rms, 1e-7))
        let norm = max(0, min(1, (db + 50) / 50)) // -50 dB … 0 dB → 0 … 1
        levelAccumulator.sum += norm
        levelAccumulator.count += 1
        if levelAccumulator.count >= 4 {
            onLevel?(levelAccumulator.sum / Float(levelAccumulator.count))
            levelAccumulator = (0, 0)
        }
    }

    private func setState(_ s: State) {
        state = s
        onStateChanged?(s)
    }
}
