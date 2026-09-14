import SwiftUI
import UniformTypeIdentifiers

@MainActor
struct MeetingsListView: View {
    @Environment(TemplateStore.self) private var templates
    @Environment(RecordingCoordinator.self) private var recorder
    @State private var items: [MeetingSummary] = []
    @State private var query = ""
    @State private var loading = false
    @State private var error: String?
    @State private var showNew = false
    @State private var path = NavigationPath()
    @State private var importURL: URL?
    @State private var showImporter = false

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if items.isEmpty && !loading {
                    ContentUnavailableView {
                        Label("Пока нет встреч", systemImage: "waveform")
                    } description: {
                        Text("Нажмите «Записать встречу», выберите тип встречи и начните запись. Отчёт появится через несколько минут после остановки.")
                    } actions: {
                        Button("Записать встречу") { showNew = true }.buttonStyle(.borderedProminent)
                    }
                } else {
                    List {
                        if let error { ErrorBanner(message: error).listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
                        ForEach(items) { m in
                            NavigationLink(value: m.id) { MeetingRow(meeting: m) }
                        }
                    }
                    .listStyle(.plain)
                    .refreshable { await load() }
                }
            }
            .navigationTitle("Встречи")
            .navigationDestination(for: String.self) { id in MeetingDetailView(meetingId: id) }
            .searchable(text: $query, prompt: "Поиск по названию")
            .onChange(of: query) { _, _ in Task { await load() } }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { showNew = true } label: { Label("Записать встречу", systemImage: "record.circle") }
                        Button { showImporter = true } label: { Label("Импортировать аудио / видео", systemImage: "square.and.arrow.down") }
                    } label: { Label("Добавить", systemImage: "plus") }
                    .disabled(recorder.isActive)
                }
            }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.audio, .movie, .mpeg4Movie, .mpeg4Audio, .mp3, .wav, .quickTimeMovie], allowsMultipleSelection: false) { result in
                if case .success(let urls) = result, let url = urls.first { importURL = url }
            }
            .sheet(item: $importURL) { url in NewMeetingFlow(importURL: url) }
            .safeAreaInset(edge: .bottom) {
                if !items.isEmpty {
                    Button { showNew = true } label: {
                        Label("Записать встречу", systemImage: "record.circle")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(recorder.isActive)
                    .padding(.horizontal, 16).padding(.bottom, 8)
                    .background(.bar)
                }
            }
            .sheet(isPresented: $showNew) { NewMeetingFlow() }
            .task {
                await templates.refresh()
                await load()
                PushRegistrar.shared.requestAuthorizationAndRegister()
                await PushRegistrar.shared.sync()
                PushRegistrar.shared.onOpenMeeting = { id in path.append(id) }
            }
            .onChange(of: recorder.finalizedMeetingId) { _, id in
                if let id {
                    recorder.reset()
                    showNew = false
                    Task { await load() }
                    path.append(id)
                }
            }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            items = try await APIClient.shared.meetings(query: query).items
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct MeetingRow: View {
    let meeting: MeetingSummary
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(meeting.templateEmoji).font(.title2)
            VStack(alignment: .leading, spacing: 4) {
                Text(meeting.title).font(.body.weight(.medium)).lineLimit(2)
                Text("\(meeting.templateTitle) · \(Fmt.dateTime.string(from: meeting.startedAt)) · \(Fmt.duration(meeting.durationSec))")
                    .font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    StatusBadge(status: meeting.status)
                    if meeting.confidentiality == "restricted" { Image(systemName: "lock.fill").font(.caption2).foregroundStyle(.secondary) }
                    if !meeting.isOwner { Image(systemName: "person.2").font(.caption2).foregroundStyle(.secondary) }
                }
            }
        }
        .padding(.vertical, 4)
    }
}
