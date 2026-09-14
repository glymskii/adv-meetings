import type { meetingTemplates, meetings, transcripts } from "../db/schema/index.js";
import type { Marker, Participant, SpeakerMap, TranscriptSegment } from "../db/types.js";
import { catalog } from "../templates/catalog.js";

type Template = typeof meetingTemplates.$inferSelect;
type Meeting = typeof meetings.$inferSelect;
type Transcript = typeof transcripts.$inferSelect;

export const GLOBAL_RULES = catalog.globalRules;

/**
 * System-промпт: стабильная часть (роль + глобальные правила) + часть шаблона.
 * Обе части детерминированы для данной версии шаблона → кешируются (cache_control).
 */
export function buildSystemPrompt(t: Template): { stable: string; template: string } {
  const stable = [
    "Ты — профессиональный ассистент медиа-агентства холдинга ADV Kazakhstan. Ты составляешь контакт-репорты и протоколы встреч по транскриптам аудиозаписей.",
    "",
    "ОБЩИЕ ПРАВИЛА:",
    ...GLOBAL_RULES.map((r, i) => `${i + 1}. ${r}`),
    "",
    "ФОРМАТ ВЫВОДА: строго JSON по заданной схеме. В массив sections включай только текстовые разделы (kind=text) — по одному объекту на раздел, key ровно как в шаблоне, content в markdown (списки, подпункты, таблицы там, где просит шаблон). Разделы других типов (участники, action plan, решения, открытые вопросы, запросы к клиенту, следующая встреча) заполняй через отдельные поля participants / actionItems / decisions / openQuestions / clientRequests / nextMeeting — в sections их не дублируй.",
  ].join("\n");

  const sectionsText = t.reportSections
    .map((s, i) => {
      const flags = [s.internalOnly ? "внутренний блок — не для внешней стороны" : null].filter(Boolean).join("; ");
      const kindNote =
        s.kind === "text"
          ? "sections[].content"
          : s.kind === "participants"
            ? "поле participants"
            : s.kind === "action_plan"
              ? "поле actionItems"
              : s.kind === "decisions"
                ? "поле decisions"
                : s.kind === "open_questions"
                  ? "поле openQuestions"
                  : s.kind === "client_requests"
                    ? "поле clientRequests"
                    : "поле nextMeeting";
      return `${i + 1}. ${s.heading} [key=${s.key}; заполняется через ${kindNote}${flags ? "; " + flags : ""}]${s.guidance ? `\n   Указания: ${s.guidance}` : ""}`;
    })
    .join("\n");

  const template = [
    `ТИП ВСТРЕЧИ: ${t.title}${t.subtitle ? ` — ${t.subtitle}` : ""}`,
    `ЦЕЛЬ: ${t.goal}`,
    `ЗАГОЛОВОК ДОКУМЕНТА: ${t.reportTitle}`,
    `ТОН: ${t.tone ?? "профессиональный, деловой"}. Язык: русский.`,
    "",
    "СТРУКТУРА ОТЧЁТА (соблюдай порядок и ключи):",
    sectionsText,
    "",
    "ПРАВИЛА ДЛЯ ЭТОГО ТИПА ВСТРЕЧИ:",
    ...t.rules.map((r, i) => `${i + 1}. ${r}`),
  ].join("\n");

  return { stable, template };
}

export function formatTimestamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function speakerLabel(speakerId: string, map: SpeakerMap): string {
  const custom = map[speakerId];
  if (custom && custom.trim()) return custom.trim();
  const n = Number.parseInt(speakerId.replace(/\D+/g, ""), 10);
  return Number.isFinite(n) ? `Спикер ${n + 1}` : speakerId;
}

export function formatTranscript(segments: TranscriptSegment[], speakers: SpeakerMap): string {
  return segments.map((s) => `[${formatTimestamp(s.start)}] ${speakerLabel(s.speakerId, speakers)}: ${s.text}`).join("\n");
}

function formatContext(t: Template, m: Meeting): string {
  const fields = [...t.commonFields, ...t.specificFields];
  const lines: string[] = [];
  for (const f of fields) {
    const v = m.contextFields[f.key];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    lines.push(`- ${f.label}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  }
  return lines.length ? lines.join("\n") : "- (пользователь ничего не заполнил — извлекай всё из транскрипта)";
}

function formatParticipantsHint(p: Participant[]): string {
  if (!p.length) return "";
  return "\nУЧАСТНИКИ (по данным пользователя):\n" + p.map((x) => `- ${[x.name, x.role, x.company].filter(Boolean).join(" · ")}`).join("\n");
}

function formatMarkers(markers: Marker[]): string {
  if (!markers.length) return "";
  return "\nОТМЕТКИ ПОЛЬЗОВАТЕЛЯ ВО ВРЕМЯ ЗАПИСИ (важные моменты):\n" + markers.map((mk) => `- [${formatTimestamp(mk.atSec)}] ${mk.note?.trim() || "важный момент"}`).join("\n");
}

export function buildUserPrompt(t: Template, m: Meeting, tr: Transcript): string {
  const date = m.startedAt.toLocaleString("ru-RU", { timeZone: "Asia/Almaty", dateStyle: "long", timeStyle: "short" });
  const isoDate = new Date(m.startedAt.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  const weekday = m.startedAt.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty", weekday: "long" });
  const dur = m.durationSec ? `${Math.round(m.durationSec / 60)} мин` : tr.audioDurationSec ? `${Math.round(Number(tr.audioDurationSec) / 60)} мин` : "неизвестно";
  const speakers = tr.speakers ?? {};
  const speakerLines = Object.keys(speakers).length
    ? "\nКАРТА СПИКЕРОВ (задана пользователем):\n" + Object.entries(speakers).map(([id, name]) => `- ${id} → ${name}`).join("\n")
    : "\nКарта спикеров не задана: в транскрипте спикеры обозначены как «Спикер N». Если по контексту ясно, кто это (представился, обращаются по имени) — используй имя, иначе оставляй «Спикер N».";

  return [
    "ДАННЫЕ ВСТРЕЧИ:",
    `- Тип: ${t.title}`,
    `- Дата и время: ${date} (Алматы), ${weekday}; ISO-дата встречи: ${isoDate} — от неё считай относительные сроки («к пятнице», «через неделю», «20-го»)`,
    `- Длительность: ${dur}`,
    `- Платформа / место: ${m.platform ?? "не указано"}`,
    `- Язык записи: ${tr.languageCode ?? "авто"}`,
    "",
    "КОНТЕКСТ ОТ ПОЛЬЗОВАТЕЛЯ (заполнен до/после встречи):",
    formatContext(t, m),
    formatParticipantsHint(m.participantsHint),
    speakerLines,
    formatMarkers(m.markers),
    "",
    "ТРАНСКРИПТ (автоматическая расшифровка, возможны ошибки распознавания имён и терминов — исправляй по контексту):",
    "<transcript>",
    formatTranscript(tr.segments, speakers),
    "</transcript>",
    "",
    "Составь отчёт по структуре шаблона. Верни только JSON.",
  ].join("\n");
}
