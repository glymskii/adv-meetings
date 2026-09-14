import { z } from "zod";

/** Структурированный вывод модели (structured outputs). Все поля обязательны, пустое = [] / null. */
export const ParticipantOut = z.object({
  name: z.string(),
  role: z.string().nullable(),
  company: z.string().nullable(),
  side: z.enum(["ours", "client", "vendor", "unknown"]),
});

export const ActionItemOut = z.object({
  assignee: z.string().nullable().describe("Имя ответственного или null, если не назван"),
  task: z.string().describe("Конкретная задача"),
  deadline: z.string().nullable().describe("Дедлайн как прозвучал (дата или срок) или null"),
  quote: z.string().nullable().describe("Короткая дословная цитата из транскрипта, подтверждающая задачу, или null"),
});

export const DecisionOut = z.object({
  decision: z.string(),
  owner: z.string().nullable(),
  deadline: z.string().nullable(),
});

export const NextMeetingOut = z.object({
  when: z.string().nullable(),
  format: z.string().nullable(),
  agenda: z.string().nullable(),
});

export const ReportOut = z.object({
  title: z.string().describe("Короткий заголовок встречи: клиент/проект + суть, до 80 символов"),
  summary: z.string().describe("Резюме для первого раздела отчёта"),
  participants: z.array(ParticipantOut),
  sections: z
    .array(z.object({ key: z.string(), content: z.string() }))
    .describe("Только текстовые разделы шаблона (kind=text), в порядке шаблона; content — markdown"),
  actionItems: z.array(ActionItemOut),
  decisions: z.array(DecisionOut),
  openQuestions: z.array(z.string()).describe("Открытые вопросы / вопросы к клиенту или вендору"),
  clientRequests: z.array(z.string()).describe("Что требуется от клиента (решения, материалы); [] если неприменимо"),
  missingInfo: z.array(z.string()).describe("Что не прозвучало и нужно уточнить"),
  nextMeeting: NextMeetingOut.nullable(),
});

export type ReportOutput = z.infer<typeof ReportOut>;
