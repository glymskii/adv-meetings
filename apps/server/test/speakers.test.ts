import { describe, expect, it } from "vitest";
import { applySpeakerMerges } from "../src/transcript/speakers.js";
import { normalize } from "../src/llm/speakers.js";

const seg = (start: number, end: number, speakerId: string, text: string) => ({ start, end, speakerId, text });

describe("applySpeakerMerges", () => {
  const state = {
    segments: [seg(0, 5, "speaker_0", "Привет всем."), seg(5, 9, "speaker_3", "Продолжу мысль."), seg(9.5, 12, "speaker_0", "И ещё."), seg(20, 25, "speaker_1", "Мы согласны.")],
    speakers: { speaker_3: "Асель" },
    speakerRoles: { speaker_3: "ours" as const, speaker_1: "client" as const },
    selfSpeakerId: "speaker_3",
  };

  it("переносит реплики, имя, роль и «это я» на основного спикера и склеивает соседние реплики", () => {
    const r = applySpeakerMerges(state, { speaker_3: "speaker_0" });
    expect(r.segments.map((s) => s.speakerId)).toEqual(["speaker_0", "speaker_1"]);
    expect(r.segments[0]!.text).toBe("Привет всем. Продолжу мысль. И ещё.");
    expect(r.segments[0]!.end).toBe(12);
    expect(r.speakers).toEqual({ speaker_0: "Асель" });
    expect(r.speakerRoles).toEqual({ speaker_0: "ours", speaker_1: "client" });
    expect(r.selfSpeakerId).toBe("speaker_0");
  });

  it("не трогает имя основного, если оно уже задано; разрешает цепочки и игнорирует циклы", () => {
    const r = applySpeakerMerges({ ...state, speakers: { speaker_0: "Данияр", speaker_3: "Асель" } }, { speaker_3: "speaker_1", speaker_1: "speaker_0" });
    expect(new Set(r.segments.map((s) => s.speakerId))).toEqual(new Set(["speaker_0"]));
    expect(r.speakers).toEqual({ speaker_0: "Данияр" });
    const cyc = applySpeakerMerges(state, { speaker_0: "speaker_1", speaker_1: "speaker_0" });
    expect(cyc.segments.map((s) => s.speakerId)).toEqual(state.segments.map((s) => s.speakerId));
  });

  it("не склеивает реплики с паузой больше секунды", () => {
    const r = applySpeakerMerges({ ...state, segments: [seg(0, 5, "speaker_0", "A"), seg(7, 9, "speaker_3", "B")] }, { speaker_3: "speaker_0" });
    expect(r.segments).toHaveLength(2);
  });
});

describe("normalize (подсказки спикеров)", () => {
  it("оставляет только реальные id, убирает самоссылки и цепочки sameAs, дополняет пропущенных", () => {
    const out = normalize(
      {
        estimatedSpeakerCount: 5,
        speakers: [
          { speakerId: "speaker_0", name: "Асель", role: null, company: null, side: "ours", confidence: "high", evidence: "представилась", sameAs: null },
          { speakerId: "speaker_2", name: null, role: null, company: null, side: "unknown", confidence: "low", evidence: null, sameAs: "speaker_2" },
          { speakerId: "speaker_3", name: null, role: null, company: null, side: "unknown", confidence: "low", evidence: null, sameAs: "speaker_4" },
          { speakerId: "speaker_4", name: null, role: null, company: null, side: "client", confidence: "medium", evidence: null, sameAs: "speaker_1" },
          { speakerId: "speaker_9", name: "Призрак", role: null, company: null, side: "vendor", confidence: "high", evidence: null, sameAs: null },
        ],
        notes: " ",
      },
      ["speaker_0", "speaker_1", "speaker_2", "speaker_3", "speaker_4"],
      "test-model",
    );
    expect(out.speakers.map((s) => s.speakerId)).toEqual(["speaker_0", "speaker_1", "speaker_2", "speaker_3", "speaker_4"]);
    expect(out.speakers.find((s) => s.speakerId === "speaker_1")!.side).toBe("unknown");
    expect(out.speakers.find((s) => s.speakerId === "speaker_2")!.sameAs).toBeNull();
    expect(out.speakers.find((s) => s.speakerId === "speaker_3")!.sameAs).toBeNull(); // цель сама дубль — цепочку рвём
    expect(out.speakers.find((s) => s.speakerId === "speaker_4")!.sameAs).toBe("speaker_1");
    expect(out.estimatedSpeakerCount).toBe(4);
    expect(out.notes).toBeNull();
  });
});
