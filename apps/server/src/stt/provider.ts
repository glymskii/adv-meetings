import type { TranscriptSegment } from "../db/types.js";

export interface TranscribeRequest {
  /** HTTPS URL аудио (presigned GET) */
  sourceUrl: string;
  /** Подсказка по числу спикеров (1–32) */
  numSpeakers?: number | null;
  /** ISO-639-1: ru | kk | en. null = автоопределение */
  language?: string | null;
  /** Словарь терминов (бренды, имена) */
  keyterms?: string[];
  /** Коррелирующий id (meetingId) для логов/метаданных */
  correlationId?: string;
}

export interface TranscribeResult {
  provider: string;
  providerRequestId: string | null;
  languageCode: string | null;
  languageProbability: number | null;
  fullText: string;
  segments: TranscriptSegment[];
  speakerIds: string[];
  audioDurationSec: number | null;
  wordCount: number;
  /** Оценка стоимости в USD (по прайсу провайдера) */
  costUsd: number;
}

export interface SttProvider {
  readonly name: string;
  transcribe(req: TranscribeRequest): Promise<TranscribeResult>;
}

export class SttError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SttError";
  }
}
