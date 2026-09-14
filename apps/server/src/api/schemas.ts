import { z } from "@hono/zod-openapi";

export const IdParam = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });

export const ErrorSchema = z.object({ error: z.string(), code: z.string().optional() }).openapi("Error");

export const TemplateFieldSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    hint: z.string().optional(),
    type: z.enum(["text", "list", "number"]).optional(),
    askBeforeRecording: z.boolean().optional(),
  })
  .openapi("TemplateField");

export const TemplateSectionSchema = z
  .object({
    key: z.string(),
    heading: z.string(),
    kind: z.enum(["text", "participants", "action_plan", "decisions", "open_questions", "client_requests", "next_meeting"]),
    guidance: z.string().optional(),
    internalOnly: z.boolean().optional(),
  })
  .openapi("TemplateSection");

export const TemplateSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    version: z.number().int(),
    group: z.enum(["internal", "client", "vendor"]),
    category: z.string(),
    title: z.string(),
    subtitle: z.string().nullable(),
    goal: z.string(),
    reportTitle: z.string(),
    emoji: z.string(),
    color: z.string(),
    confidentiality: z.enum(["standard", "restricted"]),
    allowConfidentialityChoice: z.boolean(),
    slaHours: z.number().int(),
    sendTo: z.string().nullable(),
    commonFields: z.array(TemplateFieldSchema),
    specificFields: z.array(TemplateFieldSchema),
    reportSections: z.array(TemplateSectionSchema),
    tips: z.array(z.string()),
    isDraft: z.boolean(),
    sortOrder: z.number().int(),
  })
  .openapi("Template");

export const TemplateGroupSchema = z
  .object({ code: z.enum(["internal", "client", "vendor"]), title: z.string(), subtitle: z.string(), emoji: z.string(), color: z.string(), order: z.number().int() })
  .openapi("TemplateGroup");

export const TemplateCategorySchema = z.object({ code: z.string(), title: z.string(), order: z.number().int() }).openapi("TemplateCategory");

export const TemplatesResponse = z
  .object({ groups: z.array(TemplateGroupSchema), categories: z.array(TemplateCategorySchema), templates: z.array(TemplateSchema) })
  .openapi("TemplatesResponse");

export const ParticipantSchema = z
  .object({
    name: z.string().min(1),
    role: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    side: z.enum(["ours", "client", "vendor", "unknown"]).nullable().optional(),
  })
  .openapi("Participant");

export const MarkerSchema = z.object({ atSec: z.number().min(0), note: z.string().nullable().optional(), createdAt: z.string() }).openapi("Marker");

export const MeetingStatus = z.enum(["recording", "uploading", "queued", "processing", "transcribing", "summarizing", "done", "failed"]).openapi("MeetingStatus");

export const CreateMeetingBody = z
  .object({
    templateId: z.string().uuid(),
    title: z.string().max(200).optional(),
    source: z.enum(["recorded", "imported"]).default("recorded"),
    startedAt: z.string().datetime({ offset: true }).optional(),
    contextFields: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number(), z.null()])).default({}),
    participantsHint: z.array(ParticipantSchema).default([]),
    numSpeakersHint: z.number().int().min(1).max(32).nullable().optional(),
    languageHint: z.enum(["ru", "kk", "en"]).nullable().optional(),
    platform: z.string().max(100).nullable().optional(),
    confidentiality: z.enum(["standard", "restricted"]).optional(),
    deviceId: z.string().max(100).optional(),
  })
  .openapi("CreateMeetingBody");

export const UpdateMeetingBody = z
  .object({
    title: z.string().max(200).optional(),
    contextFields: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number(), z.null()])).optional(),
    participantsHint: z.array(ParticipantSchema).optional(),
    numSpeakersHint: z.number().int().min(1).max(32).nullable().optional(),
    languageHint: z.enum(["ru", "kk", "en"]).nullable().optional(),
    platform: z.string().max(100).nullable().optional(),
    markers: z.array(MarkerSchema).optional(),
    confidentiality: z.enum(["standard", "restricted"]).optional(),
  })
  .openapi("UpdateMeetingBody");

export const MeetingSummarySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    status: MeetingStatus,
    statusDetail: z.string().nullable(),
    error: z.string().nullable(),
    templateId: z.string().uuid(),
    templateCode: z.string(),
    templateTitle: z.string(),
    templateEmoji: z.string(),
    group: z.string(),
    source: z.enum(["recorded", "imported"]),
    confidentiality: z.enum(["standard", "restricted"]),
    startedAt: z.string(),
    endedAt: z.string().nullable(),
    durationSec: z.number().int().nullable(),
    segmentCount: z.number().int(),
    hasTranscript: z.boolean(),
    hasReport: z.boolean(),
    isOwner: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("MeetingSummary");

export const TranscriptSegmentSchema = z.object({ start: z.number(), end: z.number(), speakerId: z.string(), text: z.string() }).openapi("TranscriptSegment");

export const TranscriptSchema = z
  .object({
    id: z.string().uuid(),
    provider: z.string(),
    languageCode: z.string().nullable(),
    segments: z.array(TranscriptSegmentSchema),
    speakers: z.record(z.string(), z.string()),
    selfSpeakerId: z.string().nullable(),
    speakerRoles: z.record(z.string(), z.enum(["ours", "client", "vendor"])),
    speakerIds: z.array(z.string()),
    audioDurationSec: z.number().nullable(),
    wordCount: z.number().int(),
    createdAt: z.string(),
  })
  .openapi("Transcript");

export const ActionItemSchema = z
  .object({ assignee: z.string().nullable(), task: z.string(), deadline: z.string().nullable(), quote: z.string().nullable().optional(), done: z.boolean().optional() })
  .openapi("ActionItem");
export const DecisionSchema = z.object({ decision: z.string(), owner: z.string().nullable(), deadline: z.string().nullable() }).openapi("Decision");
export const NextMeetingSchema = z.object({ when: z.string().nullable(), format: z.string().nullable(), agenda: z.string().nullable() }).openapi("NextMeeting");

export const RenderedSectionSchema = z
  .object({
    key: z.string(),
    heading: z.string(),
    kind: z.string(),
    internalOnly: z.boolean(),
    content: z.string(),
    table: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.string())) }).optional(),
    items: z.array(z.string()).optional(),
  })
  .openapi("RenderedSection");

export const ReportSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int(),
    templateId: z.string().uuid(),
    templateCode: z.string(),
    reportTitle: z.string(),
    model: z.string(),
    effort: z.string().nullable(),
    title: z.string(),
    summary: z.string(),
    participants: z.array(ParticipantSchema),
    sections: z.array(RenderedSectionSchema),
    actionItems: z.array(ActionItemSchema),
    decisions: z.array(DecisionSchema),
    openQuestions: z.array(z.string()),
    clientRequests: z.array(z.string()),
    missingInfo: z.array(z.string()),
    nextMeeting: NextMeetingSchema.nullable(),
    markdown: z.string(),
    createdBy: z.string(),
    createdAt: z.string(),
  })
  .openapi("Report");

export const MeetingDetailSchema = MeetingSummarySchema.extend({
  tasks: z.array(z.lazy(() => TaskSchema)),
  reportDueAt: z.string(),
  reportSlaHours: z.number().int(),
  contextFields: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number(), z.null()])),
  participantsHint: z.array(ParticipantSchema),
  numSpeakersHint: z.number().int().nullable(),
  languageHint: z.string().nullable(),
  platform: z.string().nullable(),
  markers: z.array(MarkerSchema),
  transcript: TranscriptSchema.nullable(),
  report: ReportSchema.nullable(),
  reportVersions: z.array(z.object({ id: z.string().uuid(), version: z.number().int(), templateCode: z.string(), createdAt: z.string(), createdBy: z.string() })),
}).openapi("MeetingDetail");

export const SegmentRequestBody = z
  .object({
    seq: z.number().int().min(0).max(9999),
    contentType: z.enum(["audio/mp4", "audio/m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/ogg", "video/mp4", "audio/x-m4a", "video/quicktime", "audio/webm", "video/webm", "audio/flac", "application/octet-stream"]).default("audio/mp4"),
    kind: z.enum(["segment", "import"]).default("segment"),
    extension: z.string().regex(/^[a-z0-9]{1,5}$/).default("m4a"),
  })
  .openapi("SegmentRequestBody");

export const SegmentUploadSchema = z
  .object({ seq: z.number().int(), objectKey: z.string(), uploadUrl: z.string().url(), expiresInSec: z.number().int(), headers: z.record(z.string(), z.string()) })
  .openapi("SegmentUpload");

export const SegmentCompleteBody = z.object({ durationSec: z.number().min(0).optional(), sizeBytes: z.number().int().min(0).optional() }).openapi("SegmentCompleteBody");

export const FinalizeBody = z
  .object({ endedAt: z.string().datetime({ offset: true }).optional(), durationSec: z.number().int().min(0).optional(), markers: z.array(MarkerSchema).optional() })
  .openapi("FinalizeBody");

export const SpeakersBody = z
  .object({
    speakers: z.record(z.string(), z.string().max(80)),
    /** speaker_N — владелец записи (текущий пользователь); null — снять отметку */
    selfSpeakerId: z.string().max(40).nullable().optional(),
    /** Роли спикеров: ours / client / vendor (отсутствие ключа = не задана) */
    speakerRoles: z.record(z.string(), z.enum(["ours", "client", "vendor"])).optional(),
  })
  .openapi("SpeakersBody");

export const RegenerateBody = z
  .object({ templateId: z.string().uuid().optional(), effort: z.enum(["low", "medium", "high", "xhigh"]).optional(), draft: z.boolean().optional() })
  .openapi("RegenerateBody");

export const ShareBody = z.object({ email: z.string().email(), scope: z.enum(["report", "report_transcript"]).default("report") }).openapi("ShareBody");
export const ShareSchema = z
  .object({ id: z.string().uuid(), recipientEmail: z.string(), scope: z.enum(["report", "report_transcript"]), createdAt: z.string() })
  .openapi("Share");

export const DeviceBody = z
  .object({ platform: z.enum(["ios", "android"]), pushToken: z.string().min(10).max(500), appVersion: z.string().max(50).optional() })
  .openapi("DeviceBody");

export const MeSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    image: z.string().nullable(),
    role: z.string(),
    agencyId: z.string().nullable(),
    agencyName: z.string().nullable(),
  })
  .openapi("Me");

export const ActionItemsBody = z.object({ actionItems: z.array(ActionItemSchema) }).openapi("ActionItemsBody");

export const AccountUserSchema = z
  .object({ id: z.string(), name: z.string(), email: z.string(), agencyId: z.string().nullable(), agencyName: z.string().nullable() })
  .openapi("AccountUser");

export const StatusEventSchema = z.object({ status: MeetingStatus, statusDetail: z.string().nullable(), error: z.string().nullable(), updatedAt: z.string() }).openapi("StatusEvent");

// ---------- Задачи / люди / настройки ----------

export const PersonSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    role: z.string().nullable(),
    company: z.string().nullable(),
    email: z.string().nullable(),
    agencyId: z.string().nullable(),
    source: z.string(),
    isActive: z.boolean(),
    openTasks: z.number().int().optional(),
  })
  .openapi("Person");

export const PersonBody = z
  .object({
    name: z.string().trim().min(2).max(80),
    role: z.string().trim().max(80).nullable().optional(),
    company: z.string().trim().max(80).nullable().optional(),
    email: z.string().email().nullable().optional(),
  })
  .openapi("PersonBody");

export const TaskSchema = z
  .object({
    id: z.string().uuid(),
    meetingId: z.string().uuid(),
    meetingTitle: z.string(),
    meetingEmoji: z.string(),
    meetingStartedAt: z.string(),
    task: z.string(),
    assigneeName: z.string().nullable(),
    assigneePersonId: z.string().uuid().nullable(),
    deadlineText: z.string().nullable(),
    deadlineDate: z.string().nullable(),
    deadlineIsDefault: z.boolean(),
    quote: z.string().nullable(),
    status: z.enum(["open", "done"]),
    doneAt: z.string().nullable(),
    source: z.string(),
    isOwner: z.boolean(),
    createdAt: z.string(),
  })
  .openapi("Task");

export const TaskPatchBody = z
  .object({
    task: z.string().trim().min(1).max(500).optional(),
    status: z.enum(["open", "done"]).optional(),
    assigneePersonId: z.string().uuid().nullable().optional(),
    /** Имя для нового человека (создаст запись в справочнике) или свободный текст, если assigneePersonId = null */
    assigneeName: z.string().trim().max(80).nullable().optional(),
    deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    deadlineText: z.string().trim().max(120).nullable().optional(),
  })
  .openapi("TaskPatchBody");

export const TaskCreateBody = z
  .object({
    task: z.string().trim().min(1).max(500),
    assigneePersonId: z.string().uuid().nullable().optional(),
    assigneeName: z.string().trim().max(80).nullable().optional(),
    deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .openapi("TaskCreateBody");

export const DeadlineSettingsSchema = z
  .object({
    defaultTaskDeadlineDays: z.number().int().min(0).max(90),
    workingDaysOnly: z.boolean(),
    remindDaysBefore: z.number().int().min(0).max(30),
    remindHourLocal: z.number().int().min(0).max(23),
    reportSlaInternalHours: z.number().int().min(1).max(720),
    reportSlaExternalHours: z.number().int().min(1).max(720),
  })
  .openapi("DeadlineSettings");

export const DeadlineSettingsPatch = DeadlineSettingsSchema.partial().openapi("DeadlineSettingsPatch");
