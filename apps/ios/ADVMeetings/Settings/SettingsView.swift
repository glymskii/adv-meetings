import SwiftUI

@MainActor
struct SettingsView: View {
    @Environment(AuthService.self) private var auth
    @State private var retention = AudioRetention.current
    @State private var apiOverride = UserDefaults.standard.string(forKey: AppConfig.overrideKey) ?? ""
    @State private var localMeetings: [LocalMeeting] = []
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Аккаунт") {
                    if let me = auth.me {
                        LabeledContent("Почта", value: me.email)
                        if let a = me.agencyName { LabeledContent("Агентство", value: a) }
                        LabeledContent("Роль", value: me.role == "member" ? "Сотрудник" : me.role)
                    }
                    Button("Выйти", role: .destructive) { confirmSignOut = true }
                }
                Section {
                    Picker("Аудио на устройстве", selection: $retention) {
                        ForEach(AudioRetention.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.inline)
                    .onChange(of: retention) { _, v in AudioRetention.current = v }
                } header: {
                    Text("Хранение аудио")
                } footer: {
                    Text("На сервере аудио удаляется сразу после расшифровки — хранятся только транскрипт и отчёт. Локальная копия нужна только для повторной отправки при сбое.")
                }
                Section("Локальные записи (\(localMeetings.count))") {
                    if localMeetings.isEmpty { Text("Нет").foregroundStyle(.secondary) }
                    ForEach(localMeetings) { m in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(m.title).font(.subheadline)
                            Text("\(m.phase.rawValue) · сегментов \(m.segments.count), загружено \(m.uploadedCount) · \(Fmt.duration(Int(m.recordedSeconds)))").font(.caption).foregroundStyle(.secondary)
                            if let e = m.finalizeError { Text(e).font(.caption2).foregroundStyle(.red) }
                        }
                    }
                    .onDelete { idx in Task { for i in idx { await LocalStore.shared.remove(localMeetings[i].id) }; await reload() } }
                    if localMeetings.contains(where: { $0.phase == .stopped }) {
                        Button("Повторить отправку незавершённых") { Task { await RecordingCoordinator.shared.resumePendingFinalizations(); await reload() } }
                    }
                }
                Section {
                    TextField("URL сервера (пусто = по умолчанию)", text: $apiOverride).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .onSubmit { UserDefaults.standard.set(apiOverride, forKey: AppConfig.overrideKey) }
                    LabeledContent("Текущий", value: AppConfig.apiBaseURL.absoluteString).font(.caption)
                } header: { Text("Сервер") } footer: { Text("Для разработки. По умолчанию: \(AppConfig.defaultBaseURL.absoluteString)") }
                Section("О приложении") {
                    LabeledContent("Версия", value: (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "")
                    Text("ADV Meetings — запись встреч, расшифровка и контакт-репорты по стандарту холдинга ADV Kazakhstan.").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Настройки")
            .task { await reload() }
            .confirmationDialog("Выйти из аккаунта?", isPresented: $confirmSignOut) {
                Button("Выйти", role: .destructive) { Task { await auth.signOut() } }
            }
        }
    }

    private func reload() async { localMeetings = await LocalStore.shared.all() }
}
