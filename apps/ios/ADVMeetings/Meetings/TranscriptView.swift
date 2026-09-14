import SwiftUI

/// Транскрипт: чипсы спикеров (быстрый фильтр), переименование, «Это я» — назначить спикера владельцем аккаунта.
@MainActor
struct TranscriptView: View {
    let transcript: Transcript
    let meetingId: String
    let canEdit: Bool
    let onChanged: () async -> Void

    @Environment(AuthService.self) private var auth
    @State private var selectedSpeaker: String?
    @State private var renaming: String?
    @State private var newName = ""
    @State private var askMyName = false
    @State private var myName = ""
    @State private var pendingSelf: String?
    @State private var error: String?

    private var segments: [TranscriptSegment] {
        guard let s = selectedSpeaker else { return transcript.segments }
        return transcript.segments.filter { $0.speakerId == s }
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    chip(title: "Все · \(transcript.segments.count)", id: nil, isSelf: false)
                    ForEach(transcript.speakerIds, id: \.self) { id in
                        chip(title: "\(transcript.label(for: id)) · \(transcript.segments.filter { $0.speakerId == id }.count)", id: id, isSelf: transcript.selfSpeakerId == id)
                            .contextMenu {
                                if canEdit {
                                    Button { renaming = id; newName = transcript.speakers[id] ?? "" } label: { Label("Переименовать", systemImage: "pencil") }
                                    Button { Task { await markSelf(id) } } label: { Label(transcript.selfSpeakerId == id ? "Это не я" : "Это я", systemImage: "person.crop.circle.badge.checkmark") }
                                }
                            }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 8)
            }
            .background(.bar)

            List {
                Section {
                    ForEach(segments) { s in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(transcript.label(for: s.speakerId)).font(.caption.weight(.semibold)).foregroundStyle(.tint)
                                if transcript.selfSpeakerId == s.speakerId { Image(systemName: "person.crop.circle.badge.checkmark").font(.caption2).foregroundStyle(.tint) }
                                Text(Fmt.clock(s.start)).font(.caption2.monospacedDigit()).foregroundStyle(.tertiary)
                            }
                            Text(s.text).font(.subheadline)
                        }
                        .contextMenu {
                            if canEdit {
                                Button { renaming = s.speakerId; newName = transcript.speakers[s.speakerId] ?? "" } label: { Label("Переименовать спикера", systemImage: "pencil") }
                                Button { Task { await markSelf(s.speakerId) } } label: { Label(transcript.selfSpeakerId == s.speakerId ? "Это не я" : "Это я", systemImage: "person.crop.circle.badge.checkmark") }
                                Button { selectedSpeaker = s.speakerId } label: { Label("Только этот спикер", systemImage: "line.3.horizontal.decrease") }
                            }
                            Button { UIPasteboard.general.string = s.text } label: { Label("Копировать", systemImage: "doc.on.doc") }
                        }
                    }
                } header: {
                    HStack {
                        Text("\(transcript.speakerIds.count) говорящих · \(transcript.wordCount) слов")
                        Spacer()
                        if canEdit { Text("Долгое нажатие на спикера — переименовать / «Это я»").font(.caption2) }
                    }
                } footer: {
                    if let error { Text(error).foregroundStyle(.red) }
                }
            }
            .listStyle(.plain)
        }
        .alert("Имя спикера", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Имя", text: $newName)
            Button("Сохранить") {
                guard let id = renaming else { return }
                var map = transcript.speakers
                map[id] = newName
                Task { await apply(map, selfSpeakerId: nil) }
                renaming = nil
            }
            Button("Отмена", role: .cancel) { renaming = nil }
        } message: {
            Text("Имя попадёт в отчёт после пересборки (меню ⋯ → Пересобрать).")
        }
        .alert("Как вас зовут?", isPresented: $askMyName) {
            TextField("Имя и фамилия", text: $myName)
            Button("Сохранить") { Task { await saveMyNameAndMark() } }
            Button("Отмена", role: .cancel) { pendingSelf = nil }
        } message: {
            Text("Имя сохранится в профиле и будет подставляться, когда вы отмечаете себя среди спикеров.")
        }
    }

    private func chip(title: String, id: String?, isSelf: Bool) -> some View {
        let selected = selectedSpeaker == id
        return Button {
            withAnimation(.snappy) { selectedSpeaker = id }
        } label: {
            HStack(spacing: 4) {
                if isSelf { Image(systemName: "person.crop.circle.badge.checkmark").font(.caption2) }
                Text(title).font(.caption.weight(selected ? .semibold : .regular))
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(selected ? Color.accentColor : Color(.secondarySystemBackground), in: Capsule())
            .foregroundStyle(selected ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }

    private func markSelf(_ id: String) async {
        if transcript.selfSpeakerId == id {
            await apply(transcript.speakers, selfSpeakerId: .some(nil))
            return
        }
        let name = auth.me?.name.trimmingCharacters(in: .whitespaces) ?? ""
        if name.isEmpty {
            pendingSelf = id
            myName = ""
            askMyName = true
            return
        }
        var map = transcript.speakers
        if (map[id] ?? "").isEmpty { map[id] = name }
        await apply(map, selfSpeakerId: .some(id))
    }

    private func saveMyNameAndMark() async {
        guard let id = pendingSelf else { return }
        let name = myName.trimmingCharacters(in: .whitespaces)
        guard name.count >= 2 else { return }
        do {
            try await auth.updateName(name)
            var map = transcript.speakers
            if (map[id] ?? "").isEmpty { map[id] = name }
            await apply(map, selfSpeakerId: .some(id))
        } catch { self.error = error.localizedDescription }
        pendingSelf = nil
    }

    private func apply(_ map: [String: String], selfSpeakerId: String??) async {
        do {
            _ = try await APIClient.shared.renameSpeakers(meetingId: meetingId, speakers: map, selfSpeakerId: selfSpeakerId)
            error = nil
            await onChanged()
        } catch { self.error = error.localizedDescription }
    }
}
