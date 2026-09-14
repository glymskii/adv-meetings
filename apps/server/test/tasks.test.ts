import { describe, expect, it } from "vitest";
import { computeDefaultDeadline, isPlaceholderAssignee, normalizeName, normalizeTask, toAlmatyDate } from "../src/tasks/service.js";
import { DEFAULT_DEADLINE_SETTINGS } from "../src/db/types.js";

describe("isPlaceholderAssignee", () => {
  it("отсекает спикеров и пустые значения", () => {
    for (const v of ["Спикер 1", "speaker_2", "—", "-", "не назван", "не озвучено, уточнить", "", null, undefined, "A"]) expect(isPlaceholderAssignee(v)).toBe(true);
    for (const v of ["Айгерим", "Данияр Сейткали", "Асель Нурланова"]) expect(isPlaceholderAssignee(v)).toBe(false);
  });
});

describe("normalize", () => {
  it("имена и задачи", () => {
    expect(normalizeName("  Алёна   Иванова ")).toBe("алена иванова");
    expect(normalizeTask("Подготовить медиаплан!!! (TikTok)")).toBe("подготовить медиаплан tiktok");
  });
});

describe("computeDefaultDeadline", () => {
  it("рабочие дни: пятница + 7 рабочих → следующая пятница через неделю", () => {
    // 2026-09-11 — пятница (Алматы)
    const friday = new Date("2026-09-11T05:00:00Z");
    expect(computeDefaultDeadline(friday, { ...DEFAULT_DEADLINE_SETTINGS, defaultTaskDeadlineDays: 7, workingDaysOnly: true })).toBe("2026-09-22");
    expect(computeDefaultDeadline(friday, { ...DEFAULT_DEADLINE_SETTINGS, defaultTaskDeadlineDays: 7, workingDaysOnly: false })).toBe("2026-09-18");
    expect(computeDefaultDeadline(friday, { ...DEFAULT_DEADLINE_SETTINGS, defaultTaskDeadlineDays: 0 })).toBeNull();
  });
  it("дата по Алматы", () => {
    expect(toAlmatyDate(new Date("2026-09-14T20:30:00Z"))).toBe("2026-09-15");
  });
});
