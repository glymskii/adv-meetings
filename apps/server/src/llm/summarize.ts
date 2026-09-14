import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { meetingTemplates, meetings, transcripts } from "../db/schema/index.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { ReportOut, type ReportOutput } from "./report-schema.js";
import { estimateCostUsd } from "./pricing.js";

type Template = typeof meetingTemplates.$inferSelect;
type Meeting = typeof meetings.$inferSelect;
type Transcript = typeof transcripts.$inferSelect;

export type Effort = "low" | "medium" | "high" | "xhigh";

export interface SummarizeOptions {
  model?: string;
  effort?: Effort;
  /** Что исправить (свободный текст пользователя) */
  instructions?: string;
  /** Предыдущая версия отчёта (markdown) — модель вносит правки, сохраняя остальное */
  previousMarkdown?: string;
}

export interface SummarizeResult {
  output: ReportOutput;
  model: string;
  effort: Effort;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costUsd: number;
  servedBy: string;
}

export class SummarizeError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SummarizeError";
  }
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: config().ANTHROPIC_API_KEY, maxRetries: 3, timeout: 10 * 60 * 1000 });
  return client;
}

export async function summarizeTranscript(t: Template, m: Meeting, tr: Transcript, opts: SummarizeOptions = {}): Promise<SummarizeResult> {
  const cfg = config();
  if (cfg.FAKE_PROVIDERS) return fakeSummarize(t, m, tr, opts);
  if (!cfg.ANTHROPIC_API_KEY) throw new SummarizeError("ANTHROPIC_API_KEY не задан", false);

  const model = opts.model ?? cfg.ANTHROPIC_MODEL;
  const effort = opts.effort ?? "high";
  const { stable, template } = buildSystemPrompt(t);
  const user = buildUserPrompt(t, m, tr, { instructions: opts.instructions, previousMarkdown: opts.previousMarkdown });
  const started = Date.now();

  try {
    const response = await anthropic().beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort, format: zodOutputFormat(ReportOut) },
      system: [
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
        { type: "text", text: template, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: user }],
    });

    if (response.stop_reason === "refusal") {
      throw new SummarizeError(`Модель отказалась выполнять запрос (${response.stop_details?.category ?? "unknown"})`, false);
    }
    if (response.stop_reason === "max_tokens") {
      throw new SummarizeError("Ответ модели обрезан по max_tokens", true);
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new SummarizeError("Не удалось разобрать структурированный ответ модели", true);

    const usage = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
      cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    };
    const servedBy = response.model;
    const costUsd = estimateCostUsd(servedBy, usage);
    logger.info({ meetingId: m.id, model: servedBy, effort, usage, costUsd, ms: Date.now() - started }, "Саммари готово");
    return { output: parsed, model: servedBy, effort, usage, costUsd, servedBy };
  } catch (e) {
    if (e instanceof SummarizeError) throw e;
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) {
      throw new SummarizeError(`Anthropic временно недоступен: ${(e as Error).message}`, true);
    }
    if (e instanceof Anthropic.APIError) {
      throw new SummarizeError(`Anthropic API ${e.status}: ${e.message}`, false);
    }
    throw e;
  }
}

/** Детерминированная заглушка для тестов/разработки без ключа. */
async function fakeSummarize(t: Template, m: Meeting, tr: Transcript, opts: SummarizeOptions): Promise<SummarizeResult> {
  const textSections = t.reportSections.filter((s) => s.kind === "text");
  const output: ReportOutput = {
    title: `${t.title}: ${m.title}`.slice(0, 80),
    summary: `Тестовое резюме встречи «${m.title}». Транскрипт из ${tr.segments.length} сегментов, ${tr.wordCount} слов.`,
    participants: Object.keys(tr.speakers ?? {}).length
      ? Object.entries(tr.speakers).map(([, name]) => ({ name, role: null, company: null, side: "unknown" as const }))
      : [{ name: "Спикер 1", role: null, company: null, side: "unknown" as const }],
    sections: textSections.map((s) => ({ key: s.key, content: `_(заглушка)_ Содержимое раздела «${s.heading}» по транскрипту.` })),
    actionItems: [{ assignee: "Айгерим", task: "Подготовить медиаплан", deadline: "20 мая", deadlineDate: "2027-05-20", quote: null }, { assignee: "Данияр", task: "Креативная рамка", deadline: "к пятнадцатому", deadlineDate: null, quote: null }],
    decisions: [{ decision: "Запуск кампании в июне", owner: "Данияр", deadline: "1 июня" }],
    openQuestions: ["Tone of voice клиента", "Кто утверждает бриф на стороне клиента"],
    clientRequests: [],
    missingInfo: ["Бюджет на продакшн не озвучен, уточнить"],
    nextMeeting: { when: "не озвучено", format: null, agenda: null },
  };
  return { output, model: "fake", effort: opts.effort ?? "high", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, costUsd: 0, servedBy: "fake" };
}
