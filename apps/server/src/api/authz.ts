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
 * Правила доступа:
 * - владелец — полный доступ;
 * - получатель share — по scope;
 * - agency_admin — встречи своего агентства, кроме restricted;
 * - holding_admin — все встречи, кроме restricted.
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

  if (m.confidentiality !== "restricted") {
    if (user.role === "holding_admin") return { meeting: m, isOwner: false, scope: "full" };
    if (user.role === "agency_admin" && user.agencyId && m.agencyId === user.agencyId) return { meeting: m, isOwner: false, scope: "full" };
  }
  throw new HTTPException(404, { message: "Встреча не найдена" });
}

export function requireOwner(a: Access) {
  if (!a.isOwner) throw new HTTPException(403, { message: "Действие доступно только владельцу встречи" });
}
