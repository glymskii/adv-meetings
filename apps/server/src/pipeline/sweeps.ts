import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { audioObjects, meetings } from "../db/schema/index.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { deleteObjects, listKeys } from "../storage/s3.js";
import { enqueueProcessMeeting } from "../queue/boss.js";

/** Удаляет аудио старше AUDIO_RETENTION_HOURS (страховка от упавших job) и осиротевшие объекты в bucket. */
export async function sweepAudio(): Promise<{ deleted: number; orphans: number }> {
  const d = db();
  const cutoff = new Date(Date.now() - config().AUDIO_RETENTION_HOURS * 3600 * 1000);
  const stale = await d.select().from(audioObjects).where(and(isNull(audioObjects.deletedAt), lt(audioObjects.createdAt, cutoff)));
  if (stale.length) {
    await deleteObjects(stale.map((s) => s.objectKey));
    await d.update(audioObjects).set({ deletedAt: new Date() }).where(inArray(audioObjects.id, stale.map((s) => s.id)));
  }

  // Объекты в bucket, которых нет в БД среди живых (например, загрузка без complete)
  const known = new Set((await d.select({ key: audioObjects.objectKey }).from(audioObjects).where(isNull(audioObjects.deletedAt))).map((r) => r.key));
  const all = await listKeys("meetings/");
  const orphans = all.filter((k) => !known.has(k));
  // Не трогаем совсем свежие (идёт загрузка) — проверяем по meeting.createdAt нельзя без запроса, поэтому используем prefix по meetingId
  const orphanMeetingIds = [...new Set(orphans.map((k) => k.split("/")[1]).filter((x): x is string => !!x))];
  let orphanDeleted = 0;
  if (orphanMeetingIds.length) {
    const fresh = await d
      .select({ id: meetings.id })
      .from(meetings)
      .where(and(inArray(meetings.id, orphanMeetingIds), sql`${meetings.createdAt} > ${cutoff}`));
    const freshIds = new Set(fresh.map((f) => f.id));
    const toDelete = orphans.filter((k) => !freshIds.has(k.split("/")[1] ?? ""));
    if (toDelete.length) await deleteObjects(toDelete);
    orphanDeleted = toDelete.length;
  }
  if (stale.length || orphanDeleted) logger.info({ deleted: stale.length, orphans: orphanDeleted }, "Sweep аудио");
  return { deleted: stale.length, orphans: orphanDeleted };
}

/** Встречи, зависшие в обработке дольше PIPELINE_STUCK_MINUTES, ставим в очередь заново. */
export async function sweepStuck(): Promise<number> {
  const d = db();
  const cutoff = new Date(Date.now() - config().PIPELINE_STUCK_MINUTES * 60 * 1000);
  const stuck = await d
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(inArray(meetings.status, ["processing", "transcribing", "summarizing"]), lt(meetings.updatedAt, cutoff)));
  for (const m of stuck) {
    await d.update(meetings).set({ status: "queued", statusDetail: "Повторная постановка в очередь" }).where(eq(meetings.id, m.id));
    await enqueueProcessMeeting({ meetingId: m.id });
  }
  if (stuck.length) logger.warn({ count: stuck.length }, "Перепоставлены зависшие встречи");
  return stuck.length;
}
