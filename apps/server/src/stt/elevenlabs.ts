import { config } from "../config.js";
import { logger } from "../logger.js";
import type { TranscriptSegment } from "../db/types.js";
import { SttError, type SttProvider, type TranscribeRequest, type TranscribeResult } from "./provider.js";

/** Цена Scribe v2 (batch, PAYG) — $0.22 за час аудио. */
const USD_PER_HOUR = 0.22;

interface ScribeWord {
  text: string;
  start: number | null;
  end: number | null;
  type: "word" | "spacing" | "audio_event";
  speaker_id: string | null;
  logprob?: number;
}

interface ScribeResponse {
  language_code: string;
  language_probability: number;
  text: string;
  words: ScribeWord[];
  transcription_id: string | null;
  audio_duration_secs?: number | null;
}

/**
 * Собирает слова в сегменты по спикеру. Новый сегмент — при смене спикера,
 * паузе > gapSec или превышении maxChars (чтобы сегменты оставались читаемыми).
 */
export function wordsToSegments(words: ScribeWord[], gapSec = 1.2, maxChars = 600): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let cur: TranscriptSegment | null = null;
  let lastEnd = 0;

  for (const w of words) {
    if (w.type === "audio_event") continue;
    const text = w.text;
    if (w.type === "spacing") {
      if (cur) cur.text += text;
      continue;
    }
    const speaker = w.speaker_id ?? "speaker_0";
    const start = w.start ?? lastEnd;
    const end = w.end ?? start;
    const startsNew =
      !cur || cur.speakerId !== speaker || start - lastEnd > gapSec || cur.text.length + text.length > maxChars;
    if (startsNew) {
      if (cur) {
        cur.text = cur.text.trim();
        if (cur.text) segments.push(cur);
      }
      cur = { start, end, speakerId: speaker, text };
    } else if (cur) {
      cur.text += text;
      cur.end = end;
    }
    lastEnd = end;
  }
  if (cur) {
    cur.text = cur.text.trim();
    if (cur.text) segments.push(cur);
  }
  return segments.map((s) => ({ ...s, start: round3(s.start), end: round3(s.end) }));
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export class ElevenLabsStt implements SttProvider {
  readonly name = "elevenlabs";

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const cfg = config();
    if (!cfg.ELEVENLABS_API_KEY) throw new SttError("ELEVENLABS_API_KEY не задан", false);

    const form = new FormData();
    form.set("model_id", cfg.ELEVENLABS_MODEL_ID);
    if (req.fileBytes) {
      form.set("file", new Blob([new Uint8Array(req.fileBytes)], { type: req.contentType ?? "audio/mp4" }), req.fileName ?? "audio.m4a");
    } else if (req.sourceUrl) {
      form.set("source_url", req.sourceUrl);
    } else {
      throw new SttError("Не передан ни sourceUrl, ни fileBytes", false);
    }
    form.set("diarize", "true");
    form.set("timestamps_granularity", "word");
    form.set("tag_audio_events", "false");
    if (req.numSpeakers && req.numSpeakers >= 1 && req.numSpeakers <= 32) form.set("num_speakers", String(req.numSpeakers));
    if (req.language) form.set("language_code", req.language);
    for (const term of dedupeKeyterms(req.keyterms ?? [])) form.append("keyterms", term);

    const started = Date.now();
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": cfg.ELEVENLABS_API_KEY },
      body: form,
      // Часовая запись обрабатывается 1–3 минуты; даём запас
      signal: AbortSignal.timeout(20 * 60 * 1000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status >= 500;
      logger.error({ status: res.status, body: body.slice(0, 500), correlationId: req.correlationId }, "ElevenLabs STT error");
      throw new SttError(`ElevenLabs STT HTTP ${res.status}: ${body.slice(0, 200)}`, retryable, res.status);
    }

    const data = (await res.json()) as ScribeResponse;
    const segments = wordsToSegments(data.words ?? []);
    const speakerIds = [...new Set(segments.map((s) => s.speakerId))];
    const duration = data.audio_duration_secs ?? (segments.length ? segments[segments.length - 1]!.end : null);
    const wordCount = (data.words ?? []).filter((w) => w.type === "word").length;
    const costUsd = duration ? round4((duration / 3600) * USD_PER_HOUR) : 0;

    logger.info(
      { correlationId: req.correlationId, ms: Date.now() - started, duration, speakers: speakerIds.length, words: wordCount, lang: data.language_code },
      "ElevenLabs STT done",
    );

    return {
      provider: this.name,
      providerRequestId: data.transcription_id,
      languageCode: data.language_code ?? null,
      languageProbability: data.language_probability ?? null,
      fullText: data.text ?? segments.map((s) => s.text).join(" "),
      segments,
      speakerIds,
      audioDurationSec: duration,
      wordCount,
      costUsd,
    };
  }
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** До 1000 терминов, < 50 символов и ≤ 5 слов каждый, без дублей. */
export function dedupeKeyterms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const t = raw.trim();
    if (!t || t.length >= 50 || t.split(/\s+/).length > 5) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 1000) break;
  }
  return out;
}
