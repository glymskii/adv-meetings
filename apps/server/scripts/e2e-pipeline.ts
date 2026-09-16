/**
 * Сквозной прогон пайплайна на реальном аудио, без мобильного клиента и без воркера (in-process):
 *   создаёт встречу → кладёт файл в bucket как import → merge → STT → purge → Claude → печатает отчёт и метрики.
 *
 * Использование:
 *   pnpm e2e:pipeline -- <путь к аудио> [код шаблона=client_brief] [язык ru|kk|en|auto] [число спикеров]
 * Требует DATABASE_URL, S3_*, и (если FAKE_PROVIDERS не true) ELEVENLABS_API_KEY + ANTHROPIC_API_KEY.
 */
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "../src/db/client.js";
import { audioObjects, meetingTemplates, meetings, reports, transcripts, user, usageEvents } from "../src/db/schema/index.js";
import { objectKey, putObject, listKeys } from "../src/storage/s3.js";
import { processMeeting } from "../src/pipeline/process-meeting.js";
import { config } from "../src/config.js";

const [file, templateCode = "client_brief", lang = "auto", speakersArg] = process.argv.slice(2);
if (!file) {
  console.error("Укажите путь к аудиофайлу");
  process.exit(1);
}

const cfg = config();
const d = db();

// Тестовый пользователь (E2E_OWNER_EMAIL — чтобы встреча появилась у нужного аккаунта в приложении)
const email = process.env.E2E_OWNER_EMAIL ?? "e2e@adv.local";
let [u] = await d.select().from(user).where(eq(user.email, email)).limit(1);
if (!u) {
  [u] = await d.insert(user).values({ id: "e2e-user", name: "E2E", email, emailVerified: true, role: "member" }).returning();
}
const [tpl] = await d.select().from(meetingTemplates).where(and(eq(meetingTemplates.code, templateCode), eq(meetingTemplates.isActive, true))).limit(1);
if (!tpl) throw new Error(`Шаблон ${templateCode} не найден (запустите db:seed)`);

const [m] = await d
  .insert(meetings)
  .values({
    ownerId: u!.id,
    templateId: tpl.id,
    templateCode: tpl.code,
    templateVersion: tpl.version,
    title: `E2E ${basename(file)}`,
    status: "uploading",
    source: "imported",
    languageHint: lang === "auto" ? null : lang,
    numSpeakersHint: speakersArg ? Number(speakersArg) : null,
    platform: "e2e",
  })
  .returning();

const ext = extname(file).slice(1).toLowerCase() || "m4a";
const key = objectKey(m!.id, "import", 0, ext);
const bytes = await readFile(file);
const t0 = Date.now();
await putObject(key, bytes, ext === "mp3" ? "audio/mpeg" : ext === "wav" ? "audio/wav" : "audio/mp4");
await d.insert(audioObjects).values({ meetingId: m!.id, kind: "import", seq: 0, objectKey: key, contentType: "audio/mp4", sizeBytes: bytes.length, uploadedAt: new Date() });
await d.update(meetings).set({ status: "queued" }).where(eq(meetings.id, m!.id));
console.log(`▶ встреча ${m!.id}, шаблон ${tpl.code}, файл ${(bytes.length / 1e6).toFixed(1)} МБ, upload ${Date.now() - t0} мс, providers=${cfg.FAKE_PROVIDERS ? "FAKE" : "real"}`);

const t1 = Date.now();
await processMeeting({ meetingId: m!.id });
const total = Date.now() - t1;

const [mm] = await d.select().from(meetings).where(eq(meetings.id, m!.id)).limit(1);
const [tr] = await d.select().from(transcripts).where(eq(transcripts.meetingId, m!.id)).limit(1);
const [rep] = await d.select().from(reports).where(and(eq(reports.meetingId, m!.id), eq(reports.isCurrent, true))).limit(1);
const usage = await d.select().from(usageEvents).where(eq(usageEvents.meetingId, m!.id));
const leftover = await listKeys(`meetings/${m!.id}/`);

console.log(`\n■ статус: ${mm!.status}${mm!.error ? " — " + mm!.error : ""}  |  время пайплайна: ${(total / 1000).toFixed(1)} с`);
if (tr?.speakerSuggestions) {
  const sg = tr.speakerSuggestions;
  console.log(`■ спикеры (ИИ, ${sg.model}): реально ${sg.estimatedSpeakerCount}; ${sg.speakers.map((x) => `${x.speakerId}→${x.name ?? "?"}/${x.side}/${x.confidence}${x.sameAs ? " =" + x.sameAs : ""}`).join(", ")}${sg.notes ? " | " + sg.notes : ""}`);
}
if (tr) {
  const speakers = new Set(tr.segments.map((s) => s.speakerId)).size;
  console.log(`■ транскрипт: ${tr.provider}, язык ${tr.languageCode} (${tr.languageProbability}), ${tr.wordCount} слов, ${tr.segments.length} сегментов, ${speakers} спикеров, длительность ${tr.audioDurationSec} с, cost $${tr.costUsd}`);
  console.log("  первые сегменты:");
  for (const s of tr.segments.slice(0, 5)) console.log(`   [${s.start.toFixed(1)}] ${s.speakerId}: ${s.text.slice(0, 120)}`);
}
if (rep) {
  console.log(`■ отчёт v${rep.version}: модель ${rep.model}, effort ${rep.effort}, in ${rep.inputTokens} / out ${rep.outputTokens} / cache ${rep.cacheReadTokens}, cost $${rep.costUsd}`);
  console.log(`■ action items: ${rep.actionItems.length}, решений: ${rep.decisions.length}, открытых вопросов: ${rep.openQuestions.length}, не озвучено: ${rep.missingInfo.length}`);
  console.log("\n" + "─".repeat(80) + "\n" + rep.markdown + "\n" + "─".repeat(80));
}
console.log(`■ usage: ${usage.map((x) => `${x.kind}=$${x.costUsd}`).join(", ")}  |  объектов в bucket после пайплайна: ${leftover.length} ${leftover.length === 0 ? "✓" : "✗ " + leftover.join(",")}`);

await closeDb();
process.exit((mm!.status === "done" || mm!.status === "transcribed") && leftover.length === 0 ? 0 : 2);
