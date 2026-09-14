import SwiftUI

/// Экран записи: таймер, уровень, пауза, отметка, стоп. Показывается поверх всего на время записи и загрузки.
@MainActor
struct RecordingView: View {
    @Environment(RecordingCoordinator.self) private var rec
    @State private var showMarkerSheet = false
    @State private var markerNote = ""
    @State private var confirmDiscard = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                header
                Spacer()
                timer
                LevelMeter(level: rec.level, isActive: rec.phase == .recording)
                    .padding(.horizontal, 32)
                statusLine
                Spacer()
                controls
            }
            .padding(24)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if case .recording = rec.phase { Button("Отменить", role: .destructive) { confirmDiscard = true } }
                    else if case .paused = rec.phase { Button("Отменить", role: .destructive) { confirmDiscard = true } }
                }
            }
            .confirmationDialog("Отменить запись? Аудио будет удалено.", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("Удалить запись", role: .destructive) { Task { await rec.discard() } }
                Button("Продолжить запись", role: .cancel) {}
            }
            .sheet(isPresented: $showMarkerSheet) {
                NavigationStack {
                    Form {
                        Section("Отметка на \(Fmt.clock(rec.elapsed))") {
                            TextField("Заметка (необязательно)", text: $markerNote, axis: .vertical)
                        }
                    }
                    .navigationTitle("Важный момент")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Отмена") { showMarkerSheet = false } }
                        ToolbarItem(placement: .confirmationAction) { Button("Сохранить") { rec.addMarker(note: markerNote.isEmpty ? nil : markerNote); markerNote = ""; showMarkerSheet = false } }
                    }
                }
                .presentationDetents([.medium])
            }
        }
        .interactiveDismissDisabled(true)
    }

    private var header: some View {
        VStack(spacing: 6) {
            Text(rec.meeting?.templateEmoji ?? "🎙").font(.system(size: 40))
            Text(rec.meeting?.templateTitle ?? "Запись").font(.headline)
            Text(rec.meeting?.title ?? "").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center).lineLimit(2)
        }
    }

    private var timer: some View {
        Text(Fmt.clock(rec.elapsed))
            .font(.system(size: 64, weight: .light, design: .rounded).monospacedDigit())
            .contentTransition(.numericText())
    }

    @ViewBuilder private var statusLine: some View {
        switch rec.phase {
        case .recording:
            Label("Идёт запись · экран можно заблокировать", systemImage: "record.circle").foregroundStyle(.red)
        case .paused:
            Label("Пауза", systemImage: "pause.circle").foregroundStyle(.orange)
        case .interrupted:
            Label("Прервано системой (звонок?) — возобновится автоматически", systemImage: "phone.arrow.down.left").foregroundStyle(.orange).multilineTextAlignment(.center)
        case .stopping:
            Label("Закрываем запись…", systemImage: "stop.circle")
        case .uploading:
            VStack(spacing: 8) {
                ProgressView(value: Double(rec.uploadedSegments), total: Double(max(1, rec.totalSegments)))
                Text("Загрузка аудио на сервер: \(rec.uploadedSegments) из \(rec.totalSegments)").font(.footnote).foregroundStyle(.secondary)
                Text("Можно закрыть приложение — загрузка продолжится в фоне").font(.caption).foregroundStyle(.tertiary)
            }
        case .finalizing:
            Label("Отправляем на обработку…", systemImage: "paperplane")
        case .finished:
            Label("Запись отправлена. Отчёт придёт через несколько минут.", systemImage: "checkmark.circle").foregroundStyle(.green)
        case .failed(let msg):
            VStack(spacing: 8) {
                ErrorBanner(message: msg)
                Button("Повторить отправку") { Task { await retry() } }.buttonStyle(.bordered)
            }
        case .idle:
            EmptyView()
        }
    }

    @ViewBuilder private var controls: some View {
        switch rec.phase {
        case .recording, .paused, .interrupted:
            HStack(spacing: 24) {
                Button { showMarkerSheet = true } label: { circle("bookmark.fill", "Отметка", .accentColor) }
                Button {
                    if rec.phase == .recording { rec.pause() } else { rec.resume() }
                } label: { circle(rec.phase == .recording ? "pause.fill" : "play.fill", rec.phase == .recording ? "Пауза" : "Продолжить", .orange) }
                Button { Task { await rec.stop() } } label: { circle("stop.fill", "Стоп", .red) }
            }
            .padding(.bottom, 12)
            if let m = rec.meeting, !m.markers.isEmpty {
                Text("Отметок: \(m.markers.count)").font(.caption).foregroundStyle(.secondary)
            }
        case .finished:
            Button("Открыть встречу") { rec.reset() }.buttonStyle(.borderedProminent)
        case .failed:
            Button("Закрыть") { rec.reset() }.buttonStyle(.bordered)
        default:
            EmptyView()
        }
    }

    private func circle(_ icon: String, _ title: String, _ color: Color) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title2)
                .frame(width: 68, height: 68)
                .background(color.opacity(0.15), in: Circle())
                .foregroundStyle(color)
            Text(title).font(.caption)
        }
    }

    private func retry() async { await rec.retryFinalize() }
}
