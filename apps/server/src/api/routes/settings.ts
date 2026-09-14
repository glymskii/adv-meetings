import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { getDeadlineSettings, saveDeadlineSettings } from "../../tasks/service.js";
import { requireUser, type AppEnv } from "../middleware/auth.js";
import { DeadlineSettingsPatch, DeadlineSettingsSchema } from "../schemas.js";

export const settingsRoutes = new OpenAPIHono<AppEnv>();
settingsRoutes.use("*", requireUser);

settingsRoutes.openapi(
  createRoute({
    method: "get",
    path: "/deadlines",
    tags: ["settings"],
    summary: "Настройки сроков (общие для холдинга)",
    responses: { 200: { description: "OK", content: { "application/json": { schema: DeadlineSettingsSchema } } } },
  }),
  async (c) => c.json(await getDeadlineSettings(), 200),
);

settingsRoutes.openapi(
  createRoute({
    method: "put",
    path: "/deadlines",
    tags: ["settings"],
    summary: "Изменить настройки сроков",
    request: { body: { content: { "application/json": { schema: DeadlineSettingsPatch } } } },
    responses: { 200: { description: "OK", content: { "application/json": { schema: DeadlineSettingsSchema } } } },
  }),
  async (c) => {
    const u = c.get("user");
    const body = c.req.valid("json");
    return c.json(await saveDeadlineSettings(body, u.id), 200);
  },
);
