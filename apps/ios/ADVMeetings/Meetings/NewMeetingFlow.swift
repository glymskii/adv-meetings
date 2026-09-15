import SwiftUI

/// Три шага перед записью: с кем встреча → подтип → контекст (пропускаемый) → старт.
@MainActor
struct NewMeetingFlow: View {
    @Environment(TemplateStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    var importURL: URL? = nil

    var body: some View {
        NavigationStack {
            GroupPickerView()
                .navigationTitle(importURL == nil ? "С кем встреча?" : "Импорт: с кем встреча?")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } } }
                .navigationDestination(for: TemplateGroup.self) { g in TemplatePickerView(group: g) }
                .navigationDestination(for: MeetingTemplate.self) { t in ContextFormView(template: t, importURL: importURL) }
        }
        .task { await store.refresh() }
    }
}

struct GroupPickerView: View {
    @Environment(TemplateStore.self) private var store

    var body: some View {
        List {
            if !store.recentCodes.isEmpty {
                Section("Недавние") {
                    ForEach(store.recentCodes, id: \.self) { code in
                        if let t = store.templates.first(where: { $0.code == code }) {
                            NavigationLink(value: t) { TemplateRow(template: t, compact: true) }
                        }
                    }
                }
            }
            Section {
                ForEach(store.groups) { g in
                    NavigationLink(value: g) {
                        HStack(spacing: 14) {
                            Text(g.emoji).font(.title)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(g.title).font(.headline)
                                Text(g.subtitle).font(.subheadline).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(store.templates(in: g.code).count)").font(.caption).foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 6)
                    }
                }
            } header: {
                Text("Тип встречи")
            } footer: {
                if store.templates.isEmpty {
                    Text(store.lastError.map { "Не удалось загрузить шаблоны: \($0)" } ?? "Загрузка шаблонов…")
                } else {
                    Text("Тип встречи определяет структуру отчёта — по регламенту контакт-репортов холдинга.")
                }
            }
        }
    }
}

struct TemplatePickerView: View {
    @Environment(TemplateStore.self) private var store
    let group: TemplateGroup

    var body: some View {
        List {
            ForEach(store.templates(in: group.code)) { t in
                NavigationLink(value: t) { TemplateRow(template: t, compact: false) }
            }
        }
        .navigationTitle(group.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct TemplateRow: View {
    let template: MeetingTemplate
    let compact: Bool
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(template.emoji).font(compact ? .title3 : .title2)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(template.title).font(.headline)
                    if template.isRestricted { Image(systemName: "lock.fill").font(.caption).foregroundStyle(.secondary) }
                    if template.isDraft { Text("черновик").font(.caption2).padding(.horizontal, 6).padding(.vertical, 2).background(Color.orange.opacity(0.15), in: Capsule()).foregroundStyle(.orange) }
                }
                if let s = template.subtitle, !compact { Text(s).font(.subheadline).foregroundStyle(.secondary) }
                if !compact { Text(template.goal).font(.caption).foregroundStyle(.tertiary).lineLimit(2) }
            }
        }
        .padding(.vertical, compact ? 2 : 6)
    }
}

struct LabeledField: View {
    let field: TemplateField
    @Binding var text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(field.label).font(.caption).foregroundStyle(.secondary)
            TextField(field.hint ?? "", text: $text, axis: .vertical)
        }
        .padding(.vertical, 2)
    }
}

/// Контекст встречи: 2–3 ключевых поля (askBeforeRecording), участники, число спикеров, платформа.
@MainActor
struct ContextFormView: View {
    @Environment(TemplateStore.self) private var store
    @Environment(RecordingCoordinator.self) private var recorder
    @Environment(\.dismiss) private var dismiss
    let template: MeetingTemplate
    var importURL: URL? = nil

    @State private var values: [String: String] = [:]
    @State private var participants: [Participant] = []
    @State private var newParticipant = ""
    @State private var numSpeakers = 0
    @State private var platform = ""
    @State private var restricted = false
    @State private var language = "auto"
    @State private var showAllFields = false
    @State private var busy = false
    @State private var error: String?

    private var keyFields: [TemplateField] { template.specificFields.filter { $0.askBeforeRecording == true } }
    private var otherFields: [TemplateField] { template.specificFields.filter { $0.askBeforeRecording != true } }

    var body: some View {
        Form {
            Section {
                HStack(spacing: 12) {
                    Text(template.emoji).font(.largeTitle)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(template.title).font(.headline)
                        Text(template.goal).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            Section {
                ForEach(keyFields) { f in LabeledField(field: f, text: binding(f.key)) }
                if !otherFields.isEmpty {
                    DisclosureGroup("Ещё поля (\(otherFields.count))", isExpanded: $showAllFields) {
                        ForEach(otherFields) { f in LabeledField(field: f, text: binding(f.key)) }
                    }
                }
            } header: {
                Text("Контекст встречи")
            } footer: {
                Text("Всё необязательно: то, чего нет, AI извлечёт из записи, а не найденное отметит как «не озвучено, уточнить».")
            }

            Section("Участники") {
                ForEach(participants) { p in
                    Text([p.name, p.role, p.company].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                }
                .onDelete { participants.remove(atOffsets: $0) }
                HStack {
                    TextField("Имя · роль · компания", text: $newParticipant)
                        .onSubmit(addParticipant)
                    Button(action: addParticipant) { Image(systemName: "plus.circle.fill") }.disabled(newParticipant.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                Stepper(numSpeakers == 0 ? "Число говорящих: авто" : "Число говорящих: \(numSpeakers)", value: $numSpeakers, in: 0...12)
            }

            Section("Детали") {
                TextField("Место / платформа (офис, Zoom, Teams)", text: $platform)
                Picker("Язык записи", selection: $language) {
                    Text("Авто (RU / KK / EN)").tag("auto")
                    Text("Русский").tag("ru")
                    Text("Қазақша").tag("kk")
                    Text("English").tag("en")
                }
                if template.allowConfidentialityChoice {
                    Toggle("Конфиденциально (только я и те, с кем поделюсь)", isOn: $restricted)
                }
                if template.isRestricted {
                    Label("Конфиденциальная встреча: отчёт видите только вы и те, с кем поделитесь", systemImage: "lock.fill").font(.footnote).foregroundStyle(.secondary)
                }
            }

            if !template.tips.isEmpty {
                Section("Советы для этого типа встречи") {
                    ForEach(template.tips, id: \.self) { tip in
                        Label(tip, systemImage: "lightbulb").font(.footnote)
                    }
                }
            }

            if let error { Section { ErrorBanner(message: error) } }
        }
        .navigationTitle(importURL == nil ? "Перед записью" : "Импорт записи")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            Button { Task { await start() } } label: {
                HStack {
                    if busy { ProgressView().tint(.white) } else { Image(systemName: importURL == nil ? "record.circle" : "square.and.arrow.up") }
                    Text(importURL == nil ? "Начать запись" : "Отправить на обработку").font(.headline)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(importURL == nil ? .red : .accentColor)
            .disabled(busy)
            .padding(16)
            .background(.bar)
        }
    }

    private func binding(_ key: String) -> Binding<String> {
        Binding(get: { values[key] ?? "" }, set: { values[key] = $0 })
    }

    private func addParticipant() {
        let parts = newParticipant.split(separator: "·").map { $0.trimmingCharacters(in: .whitespaces) }
        guard let name = parts.first, !name.isEmpty else { return }
        participants.append(Participant(name: name, role: parts.count > 1 ? parts[1] : nil, company: parts.count > 2 ? parts[2] : nil, side: nil))
        newParticipant = ""
    }

    private func start() async {
        busy = true; error = nil
        defer { busy = false }
        var ctx: [String: ContextValue] = [:]
        for (k, v) in values where !v.trimmingCharacters(in: .whitespaces).isEmpty { ctx[k] = .string(v.trimmingCharacters(in: .whitespaces)) }
        if !participants.isEmpty { ctx["participants"] = .list(participants.map { [$0.name, $0.role, $0.company].compactMap { $0 }.joined(separator: " · ") }) }
        if !platform.isEmpty { ctx["platform"] = .string(platform) }
        let body = CreateMeetingBody(
            templateId: template.id,
            title: importURL.map { $0.deletingPathExtension().lastPathComponent },
            source: importURL == nil ? "recorded" : "imported",
            contextFields: ctx,
            participantsHint: participants,
            numSpeakersHint: numSpeakers > 0 ? numSpeakers : nil,
            languageHint: language == "auto" ? nil : language,
            platform: platform.isEmpty ? nil : platform,
            confidentiality: restricted ? "restricted" : nil,
            deviceId: UIDevice.current.identifierForVendor?.uuidString
        )
        do {
            let created = try await APIClient.shared.createMeeting(body)
            store.markUsed(template)
            if let importURL {
                try await recorder.importFile(importURL, serverMeeting: created, template: template)
            } else {
                try await recorder.start(serverMeeting: created, template: template)
            }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
