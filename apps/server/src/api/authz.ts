import { and, eq, gt, isNull, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client.js";
import { meetings, shares } from "../db/schema/index.js";
import type { SessionUser } from "./middleware/auth.js";

export type Meeting = typeof meetings.$inferSelect;

export interface Access {
  meeting: Meeting;
  isOwner: boolean;
  /** report | report_transcript | full (владелец / админ) */
  scope: "report" | "report_transcript" | "full";
}

/**
 * Правила доступа к содержимому встречи (транскрипт, отчёт, задачи):
 * - владелец — полный доступ;
 * - получатель share — по scope (report / report_transcript).
 * Роли agency_admin / holding_admin НЕ дают неявного доступа к чужим встречам: содержимое встреч видно только
 * тем, с кем ими явно поделились. Роли остаются для административных функций (шаблоны, статистика).
 */
export async function loadMeetingWithAccess(meetingId: string, user: SessionUser): Promise<Access> {
  const [m] = await db().select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
  if (!m) throw new HTTPException(404, { message: "Встреча не найдена" });
  if (m.ownerId === user.id) return { meeting: m, isOwner: true, scope: "full" };

  const [sh] = await db()
    .select()
    .from(shares)
    .where(
      and(
        eq(shares.meetingId, meetingId),
        or(eq(shares.recipientUserId, user.id), eq(shares.recipientEmail, user.email.toLowerCase())),
        or(isNull(shares.expiresAt), gt(shares.expiresAt, new Date())),
      ),
    )
    .limit(1);
  if (sh) return { meeting: m, isOwner: false, scope: sh.scope };
  throw new HTTPException(404, { message: "Встреча не найдена" });
}

export function requireOwner(a: Access) {
  if (!a.isOwner) throw new HTTPException(403, { message: "Действие доступно только владельцу встречи" });
}
