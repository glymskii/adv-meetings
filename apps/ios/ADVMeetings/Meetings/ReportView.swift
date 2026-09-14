import SwiftUI

/// Отчёт по разделам шаблона: текст (markdown), таблицы, списки, чек-лист action items.
@MainActor
struct ReportView: View {
    let report: Report
    let meeting: MeetingDetail
    let onUpdateActionItems: ([ActionItem]) async -> Void
    @State private var items: [ActionItem]

    init(report: Report, meeting: MeetingDetail, onUpdateActionItems: @escaping ([ActionItem]) async -> Void) {
        self.report = report
        self.meeting = meeting
        self.onUpdateActionItems = onUpdateActionItems
        _items = State(initialValue: report.actionItems)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(report.reportTitle).font(.caption).foregroundStyle(.secondary).textCase(.uppercase)
                    Text(report.title).font(.title3.bold())
                    HStack(spacing: 8) {
                        Text(Fmt.dateTime.string(from: meeting.startedAt))
                        if let d = meeting.durationSec { Text("· \(Fmt.duration(d))") }
                        if meeting.confidentiality == "restricted" { Label("Конфиденциально", systemImage: "lock.fill") }
                    }
                    .font(.caption).foregroundStyle(.secondary)
                    if report.version > 1 { Text("Версия отчёта \(report.version) · \(report.createdBy == "regenerate" ? "пересобран" : "авто")").font(.caption2).foregroundStyle(.tertiary) }
                }

                ForEach(Array(report.sections.enumerated()), id: \.element.key) { i, s in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 6) {
                            Text("\(i + 1). \(s.heading)").font(.headline)
                            if s.internalOnly { Image(systemName: "lock.fill").font(.caption).foregroundStyle(.orange) }
                        }
                        if s.internalOnly { Text("Внутренний блок — не для клиента").font(.caption).foregroundStyle(.orange) }
                        sectionBody(s)
                    }
                }

                if !report.missingInfo.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Не озвучено — уточнить", systemImage: "questionmark.circle").font(.headline).foregroundStyle(.orange)
                        ForEach(report.missingInfo, id: \.self) { Text("• \($0)").font(.subheadline) }
                    }
                    .padding(12)
                    .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                }

                Text("Сформировано автоматически по аудиозаписи. Проверьте факты и action items перед отправкой.")
                    .font(.caption2).foregroundStyle(.tertiary)
            }
            .padding(16)
        }
    }

    @ViewBuilder private func sectionBody(_ s: RenderedSection) -> some View {
        switch s.kind {
        case "action_plan":
            if items.isEmpty { Text("не озвучено, уточнить").foregroundStyle(.secondary).font(.subheadline) }
            ForEach($items) { $item in
                Button {
                    item.done = !(item.done ?? false)
                    Task { await onUpdateActionItems(items) }
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: (item.done ?? false) ? "checkmark.circle.fill" : "circle").foregroundStyle((item.done ?? false) ? .green : .secondary).padding(.top, 2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.task).font(.subheadline).strikethrough(item.done ?? false).foregroundStyle(.primary)
                            HStack(spacing: 8) {
                                Label(item.assignee ?? "ответственный не назван", systemImage: "person").foregroundStyle(item.assignee == nil ? .orange : .secondary)
                                Label(item.deadline ?? "без срока", systemImage: "calendar").foregroundStyle(item.deadline == nil ? .orange : .secondary)
                            }
                            .font(.caption)
                            if let q = item.quote, !q.isEmpty { Text("«\(q)»").font(.caption).italic().foregroundStyle(.tertiary) }
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        case "decisions", "participants", "open_questions", "client_requests", "next_meeting":
            if let t = s.table, !t.rows.isEmpty {
                SimpleTable(table: t)
            } else if let list = s.items, !list.isEmpty {
                ForEach(list, id: \.self) { Text("• \($0)").font(.subheadline) }
            } else {
                Text(s.content).font(.subheadline).foregroundStyle(.secondary)
            }
        default:
            MarkdownText(s.content)
        }
    }
}

/// Markdown-текст с поддержкой таблиц (| a | b |) и списков
struct MarkdownText: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, b in
                switch b {
                case .table(let t): SimpleTable(table: t)
                case .text(let s):
                    Text((try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s))
                        .font(.subheadline)
                }
            }
        }
    }

    private enum Block { case text(String); case table(RenderedTable) }

    private var blocks: [Block] {
        var out: [Block] = []
        var buf: [String] = []
        let lines = text.components(separatedBy: "\n")
        var i = 0
        func flush() { if !buf.isEmpty { out.append(.text(buf.joined(separator: "\n"))); buf = [] } }
        while i < lines.count {
            let l = lines[i]
            if l.trimmingCharacters(in: .whitespaces).hasPrefix("|"), i + 1 < lines.count, lines[i + 1].contains("---") {
                flush()
                let cols = split(l)
                var rows: [[String]] = []
                i += 2
                while i < lines.count, lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("|") { rows.append(split(lines[i])); i += 1 }
                out.append(.table(RenderedTable(columns: cols, rows: rows)))
                continue
            }
            buf.append(l.replacingOccurrences(of: "^\\s*[-*]\\s+", with: "• ", options: .regularExpression))
            i += 1
        }
        flush()
        return out
    }

    private func split(_ l: String) -> [String] {
        var s = l.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("|") { s.removeFirst() }
        if s.hasSuffix("|") { s.removeLast() }
        return s.components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
    }
}

struct SimpleTable: View {
    let table: RenderedTable
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(table.rows.enumerated()), id: \.offset) { ri, row in
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(Array(table.columns.enumerated()), id: \.offset) { ci, col in
                        if ci == 0 {
                            Text(row.indices.contains(ci) ? row[ci] : "").font(.subheadline.weight(.medium))
                        } else {
                            HStack(alignment: .top, spacing: 4) {
                                Text(col + ":").font(.caption).foregroundStyle(.secondary)
                                Text(row.indices.contains(ci) ? row[ci] : "—").font(.caption)
                            }
                        }
                    }
                }
                .padding(.vertical, 8)
                if ri < table.rows.count - 1 { Divider() }
            }
        }
        .padding(.horizontal, 12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }
}

@MainActor
struct TranscriptView: View {
    let transcript: Transcript
    let meetingId: String
    let canEdit: Bool
    let onChanged: () async -> Void
    @State private var renaming: String?
    @State private var newName = ""

    var body: some View {
        List {
            Section {
                ForEach(transcript.segments) { s in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(transcript.label(for: s.speakerId)).font(.caption.weight(.semibold)).foregroundStyle(.tint)
                            Text(Fmt.clock(s.start)).font(.caption2.monospacedDigit()).foregroundStyle(.tertiary)
                        }
                        Text(s.text).font(.subheadline)
                    }
                    .contextMenu {
                        if canEdit { Button("Переименовать спикера") { renaming = s.speakerId; newName = transcript.speakers[s.speakerId] ?? "" } }
                        Button("Копировать") { UIPasteboard.general.string = s.text }
                    }
                }
            } header: {
                HStack {
                    Text("\(transcript.speakerIds.count) говорящих · \(transcript.wordCount) слов")
                    Spacer()
                    if canEdit { Text("Долгое нажатие — переименовать спикера").font(.caption2) }
                }
            }
        }
        .listStyle(.plain)
        .alert("Имя спикера", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Имя", text: $newName)
            Button("Сохранить") {
                guard let id = renaming else { return }
                var map = transcript.speakers
                map[id] = newName
                Task { _ = try? await APIClient.shared.renameSpeakers(meetingId: meetingId, speakers: map); await onChanged() }
                renaming = nil
            }
            Button("Отмена", role: .cancel) { renaming = nil }
        } message: {
            Text("После переименования можно пересобрать отчёт с именами (меню ⋯ → Пересобрать).")
        }
    }
}

struct MeetingInfoView: View {
    let detail: MeetingDetail
    let template: MeetingTemplate?
    var body: some View {
        List {
            Section("Встреча") {
                LabeledContent("Тип", value: "\(detail.templateEmoji) \(detail.templateTitle)")
                LabeledContent("Начало", value: Fmt.dateTime.string(from: detail.startedAt))
                LabeledContent("Длительность", value: Fmt.duration(detail.durationSec))
                if let p = detail.platform, !p.isEmpty { LabeledContent("Платформа", value: p) }
                LabeledContent("Сегментов аудио", value: "\(detail.segmentCount)")
                LabeledContent("Конфиденциальность", value: detail.confidentiality == "restricted" ? "Ограниченная" : "Стандартная")
            }
            if !detail.contextFields.isEmpty {
                Section("Контекст, введённый перед записью") {
                    ForEach(detail.contextFields.keys.sorted(), id: \.self) { k in
                        let label = (template?.specificFields.first { $0.key == k }?.label) ?? (template?.commonFields.first { $0.key == k }?.label) ?? k
                        LabeledContent(label, value: detail.contextFields[k]?.displayText ?? "")
                    }
                }
            }
            if !detail.markers.isEmpty {
                Section("Отметки во время записи") {
                    ForEach(detail.markers) { m in
                        HStack { Text(Fmt.clock(m.atSec)).monospacedDigit().foregroundStyle(.secondary); Text(m.note ?? "важный момент") }
                    }
                }
            }
            if detail.reportVersions.count > 1 {
                Section("Версии отчёта") {
                    ForEach(detail.reportVersions) { v in
                        LabeledContent("v\(v.version) · \(v.templateCode)", value: Fmt.dateTime.string(from: v.createdAt))
                    }
                }
            }
            if let t = template, !t.tips.isEmpty {
                Section("Куда отправить") {
                    if let s = t.sendTo { Text(s) }
                    Text("Срок по регламенту холдинга: \(t.slaHours) ч после встречи").font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
    }
}

@MainActor
struct RegenerateSheet: View {
    let detail: MeetingDetail
    let onDone: () async -> Void
    @Environment(TemplateStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var templateId: String
    @State private var draft = false
    @State private var busy = false
    @State private var error: String?

    init(detail: MeetingDetail, onDone: @escaping () async -> Void) {
        self.detail = detail
        self.onDone = onDone
        _templateId = State(initialValue: detail.templateId)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Шаблон отчёта") {
                    Picker("Тип встречи", selection: $templateId) {
                        ForEach(store.templates) { t in Text("\(t.emoji) \(t.title)").tag(t.id) }
                    }
                }
                Section {
                    Toggle("Быстрый черновик (дешевле, чуть проще)", isOn: $draft)
                } footer: {
                    Text("Пересборка использует уже готовый транскрипт — аудио заново не нужно. Имена спикеров, если вы их задали, попадут в отчёт.")
                }
                if let error { Section { ErrorBanner(message: error) } }
            }
            .navigationTitle("Пересобрать отчёт")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Запустить") { Task { await run() } }.disabled(busy)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func run() async {
        busy = true; defer { busy = false }
        do {
            _ = try await APIClient.shared.regenerate(meetingId: detail.id, body: RegenerateBody(templateId: templateId == detail.templateId ? nil : templateId, effort: nil, draft: draft ? true : nil))
            dismiss()
            await onDone()
        } catch { self.error = error.localizedDescription }
    }
}

@MainActor
struct SharesSheet: View {
    let meetingId: String
    @Environment(\.dismiss) private var dismiss
    @State private var shares: [Share] = []
    @State private var email = ""
    @State private var withTranscript = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Добавить коллегу") {
                    TextField("Корпоративная почта", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Toggle("Вместе с транскриптом", isOn: $withTranscript)
                    Button("Поделиться") { Task { await add() } }.disabled(!email.contains("@"))
                }
                Section("Доступ есть у") {
                    if shares.isEmpty { Text("Пока ни у кого").foregroundStyle(.secondary) }
                    ForEach(shares) { s in
                        HStack { Text(s.recipientEmail); Spacer(); Text(s.scope == "report" ? "отчёт" : "отчёт + транскрипт").font(.caption).foregroundStyle(.secondary) }
                    }
                    .onDelete { idx in Task { for i in idx { try? await APIClient.shared.unshare(meetingId: meetingId, shareId: shares[i].id) }; await load() } }
                }
                if let error { Section { ErrorBanner(message: error) } }
            }
            .navigationTitle("Поделиться")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
            .task { await load() }
        }
    }

    private func load() async { shares = (try? await APIClient.shared.shares(meetingId: meetingId)) ?? [] }
    private func add() async {
        do { _ = try await APIClient.shared.share(meetingId: meetingId, email: email, scope: withTranscript ? "report_transcript" : "report"); email = ""; await load() } catch { self.error = error.localizedDescription }
    }
}
