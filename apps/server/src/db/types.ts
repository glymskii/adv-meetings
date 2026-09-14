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
  quote?: string | null;
  done?: boolean;
}

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
