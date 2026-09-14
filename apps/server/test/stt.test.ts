import { describe, expect, it } from "vitest";
import { dedupeKeyterms, wordsToSegments } from "../src/stt/elevenlabs.js";

describe("wordsToSegments", () => {
  it("группирует слова по спикеру и паузам", () => {
    const words = [
      { text: "Привет", start: 0, end: 0.4, type: "word" as const, speaker_id: "speaker_0" },
      { text: " ", start: 0.4, end: 0.5, type: "spacing" as const, speaker_id: "speaker_0" },
      { text: "всем", start: 0.5, end: 0.9, type: "word" as const, speaker_id: "speaker_0" },
      { text: "(laughter)", start: 1, end: 1.5, type: "audio_event" as const, speaker_id: null },
      { text: "Здравствуйте", start: 1.6, end: 2.2, type: "word" as const, speaker_id: "speaker_1" },
      { text: "Продолжим", start: 5.0, end: 5.5, type: "word" as const, speaker_id: "speaker_1" },
    ];
    const segs = wordsToSegments(words);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toMatchObject({ speakerId: "speaker_0", text: "Привет всем", start: 0, end: 0.9 });
    expect(segs[1]).toMatchObject({ speakerId: "speaker_1", text: "Здравствуйте" });
    expect(segs[2]).toMatchObject({ speakerId: "speaker_1", text: "Продолжим", start: 5 });
  });
});

describe("dedupeKeyterms", () => {
  it("убирает дубли, длинные и многословные термины", () => {
    const out = dedupeKeyterms(["Qazaq Beverages", "qazaq beverages", "a".repeat(60), "один два три четыре пять шесть", " TikTok "]);
    expect(out).toEqual(["Qazaq Beverages", "TikTok"]);
  });
});
