import type { SttProvider, TranscribeRequest, TranscribeResult } from "./provider.js";

/** Заглушка для тестов и разработки без ключей: возвращает фиксированный диалог на русском. */
export class FakeStt implements SttProvider {
  readonly name = "fake";
  async transcribe(_req: TranscribeRequest): Promise<TranscribeResult> {
    const lines: [string, string][] = [
      ["speaker_0", "Коллеги, начнём. Сегодня обсуждаем бриф по кампании Nomad Summer для клиента Qazaq Beverages."],
      ["speaker_1", "Да, клиент хочет запуск в июне, бюджет на медиа около сорока миллионов тенге, продакшн отдельно."],
      ["speaker_0", "Целевая аудитория — молодёжь восемнадцать-двадцать пять, Алматы и Астана. KPI — охват и продажи в сетях."],
      ["speaker_2", "Каналы: TikTok, Instagram, наружка. По KPI по продажам нужно уточнить у клиента базовую линию."],
      ["speaker_1", "Дедлайн на медиаплан — двадцатое мая. Айгерим готовит медиаплан, Данияр — креативную рамку к пятнадцатому."],
      ["speaker_0", "Открытые вопросы: tone of voice, есть ли запреты по алкогольной тематике, и кто утверждает бриф на стороне клиента."],
    ];
    let t = 0;
    const segments = lines.map(([speakerId, text]) => {
      const start = t;
      t += 6;
      return { start, end: t, speakerId, text };
    });
    return {
      provider: this.name,
      providerRequestId: "fake-" + Date.now(),
      languageCode: "ru",
      languageProbability: 0.99,
      fullText: segments.map((s) => s.text).join(" "),
      segments,
      speakerIds: ["speaker_0", "speaker_1", "speaker_2"],
      audioDurationSec: t,
      wordCount: segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0),
      costUsd: 0,
    };
  }
}
