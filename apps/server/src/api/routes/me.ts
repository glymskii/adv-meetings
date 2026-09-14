import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { agencies, devices, user as userTable } from "../../db/schema/index.js";
import { asc, ilike, or } from "drizzle-orm";
import { requireUser, type AppEnv } from "../middleware/auth.js";
import { DeviceBody, MeSchema, AccountUserSchema } from "../schemas.js";
import { z } from "@hono/zod-openapi";

export const meRoutes = new OpenAPIHono<AppEnv>();
meRoutes.use("*", requireUser);

meRoutes.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["me"],
    summary: "Текущий пользователь",
    responses: { 200: { description: "OK", content: { "application/json": { schema: MeSchema } } } },
  }),
  async (c) => {
    const u = c.get("user");
    let agencyName: string | null = null;
    if (u.agencyId) {
      const [a] = await db().select({ name: agencies.name }).from(agencies).where(eq(agencies.id, u.agencyId)).limit(1);
      agencyName = a?.name ?? null;
    }
    return c.json({ id: u.id, email: u.email, name: u.name, image: u.image, role: u.role, agencyId: u.agencyId, agencyName }, 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: "post",
    path: "/devices",
    tags: ["me"],
    summary: "Зарегистрировать push-токен устройства",
    request: { body: { content: { "application/json": { schema: DeviceBody } } } },
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } } },
  }),
  async (c) => {
    const u = c.get("user");
    const body = c.req.valid("json");
    await db()
      .insert(devices)
      .values({ userId: u.id, platform: body.platform, pushToken: body.pushToken, appVersion: body.appVersion ?? null, lastSeenAt: new Date() })
      .onConflictDoUpdate({ target: devices.pushToken, set: { userId: u.id, platform: body.platform, appVersion: body.appVersion ?? null, lastSeenAt: new Date() } });
    return c.json({ ok: true }, 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/devices/{token}",
    tags: ["me"],
    summary: "Удалить push-токен (выход)",
    request: { params: z.object({ token: z.string() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } } },
  }),
  async (c) => {
    const { token } = c.req.valid("param");
    await db().delete(devices).where(eq(devices.pushToken, token));
    return c.json({ ok: true }, 200);
  },
);

/** Справочник аккаунтов холдинга: для выбора спикеров и шаринга. */
export const usersRoutes = new OpenAPIHono<AppEnv>();
usersRoutes.use("*", requireUser);

usersRoutes.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["users"],
    summary: "Все аккаунты (имя, почта, агентство)",
    request: { query: z.object({ q: z.string().max(80).optional() }) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: z.array(AccountUserSchema) } } } },
  }),
  async (c) => {
    const { q } = c.req.valid("query");
    const rows = await db()
      .select({ id: userTable.id, name: userTable.name, email: userTable.email, agencyId: userTable.agencyId, agencyName: agencies.name })
      .from(userTable)
      .leftJoin(agencies, eq(agencies.id, userTable.agencyId))
      .where(q ? or(ilike(userTable.name, `%${q}%`), ilike(userTable.email, `%${q}%`)) : undefined)
      .orderBy(asc(userTable.name), asc(userTable.email))
      .limit(500);
    return c.json(rows.map((r) => ({ id: r.id, name: r.name, email: r.email, agencyId: r.agencyId, agencyName: r.agencyName ?? null })), 200);
  },
);
