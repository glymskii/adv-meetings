/** Типы для jsonb-колонок. Дублируются в zod-схемах API (src/api/schemas.ts). */

export type TemplateFieldType = "text" | "list" | "number";

export interface TemplateField {
  key: string;
  label: string;
  hint?: string;
  type?: TemplateFieldType;
  askBeforeRecording?: boolean;
}

export type SectionKind =
  | "text"
  | "participants"
  | "action_plan"
  | "decisions"
  | "open_questions"
  | "client_requests"
  | "next_meeting";

export interface TemplateSection {
  key: string;
  heading: string;
  kind: SectionKind;
  guidance?: string;
  internalOnly?: boolean;
}

export type ContextFields = Record<string, string | string[] | number | null>;

export interface Participant {
  name: string;
  role?: string | null;
  company?: string | null;
  side?: "ours" | "client" | "vendor" | "unknown" | null;
}

export interface Marker {
  atSec: number;
  note?: string | null;
  createdAt: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  speakerId: string; // speaker_0 ...
  text: string;
}

/** speakerId -> отображаемое имя (задаёт пользователь) */
export type SpeakerMap = Record<string, string>;

/** speakerId -> сторона: ours (коллега), client, vendor */
export type SpeakerRole = "ours" | "client" | "vendor";
export type SpeakerRoleMap = Record<string, SpeakerRole>;

export interface ReportSection {
  key: string;
  heading: string;
  content: string; // markdown
  internalOnly?: boolean;
}

export interface ActionItem {
  assignee: string | null;
  task: string;
  deadline: string | null;
  /** ISO-дата YYYY-MM-DD, если срок удалось определить */
  deadlineDate?: string | null;
  quote?: string | null;
  done?: boolean;
}

export interface DeadlineSettings {
  /** Срок по умолчанию для задач без дедлайна: дней после встречи (0 = не назначать) */
  defaultTaskDeadlineDays?: number;
  /** Считать только рабочие дни при назначении срока по умолчанию */
  workingDaysOnly?: boolean;
  /** За сколько дней до дедлайна напоминать владельцу встречи (0 = не напоминать) */
  remindDaysBefore?: number;
  /** Час напоминания по Алматы (0–23) */
  remindHourLocal?: number;
  /** SLA отправки отчёта: внутренние встречи, часов после встречи */
  reportSlaInternalHours?: number;
  /** SLA отправки отчёта: встречи с клиентом/вендором, часов после встречи */
  reportSlaExternalHours?: number;
}

export const DEFAULT_DEADLINE_SETTINGS: Required<DeadlineSettings> = {
  defaultTaskDeadlineDays: 7,
  workingDaysOnly: true,
  remindDaysBefore: 1,
  remindHourLocal: 9,
  reportSlaInternalHours: 24,
  reportSlaExternalHours: 48,
};

export interface DecisionItem {
  decision: string;
  owner: string | null;
  deadline: string | null;
}

export interface NextMeeting {
  when: string | null;
  format: string | null;
  agenda: string | null;
}
