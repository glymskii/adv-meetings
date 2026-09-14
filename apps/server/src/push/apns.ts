import { createSign } from "node:crypto";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { db } from "../db/client.js";
import { devices, meetings, reports } from "../db/schema/index.js";
import type { NotifyJob } from "../queue/boss.js";

/**
 * Минимальный APNs-клиент (HTTP/2, token-based auth, .p8).
 * Node 22 умеет HTTP/2 из коробки — сторонняя библиотека не нужна.
 */
let cachedJwt: { token: string; issuedAt: number } | null = null;

function apnsJwt(): string | null {
  const cfg = config();
  if (!cfg.APNS_KEY_ID || !cfg.APNS_TEAM_ID || !cfg.APNS_PRIVATE_KEY) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 50 * 60) return cachedJwt.token;
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: cfg.APNS_KEY_ID })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: cfg.APNS_TEAM_ID, iat: now })).toString("base64url");
  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign({ key: cfg.APNS_PRIVATE_KEY.replace(/\\n/g, "\n"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  cachedJwt = { token: `${header}.${payload}.${signature}`, issuedAt: now };
  return cachedJwt.token;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  threadId?: string;
}

export async function sendApns(deviceToken: string, payload: PushPayload): Promise<"ok" | "invalid_token" | "error" | "disabled"> {
  const jwt = apnsJwt();
  if (!jwt) return "disabled";
  const cfg = config();
  const http2 = await import("node:http2");
  const host = cfg.APNS_PRODUCTION ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";
  const client = http2.connect(host);
  try {
    return await new Promise((resolve) => {
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        authorization: `bearer ${jwt}`,
        "apns-topic": cfg.APNS_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
      let status = 0;
      let body = "";
      req.on("response", (h) => (status = Number(h[":status"])));
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (status === 200) resolve("ok");
        else if (status === 410 || (status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(body))) resolve("invalid_token");
        else {
          logger.warn({ status, body }, "APNs error");
          resolve("error");
        }
      });
      req.on("error", (e) => {
        logger.warn(e, "APNs request error");
        resolve("error");
      });
      req.end(
        JSON.stringify({
          aps: { alert: { title: payload.title, body: payload.body }, sound: "default", "thread-id": payload.threadId },
          ...payload.data,
        }),
      );
    });
  } finally {
    client.close();
  }
}

/** Уведомление владельца встречи о готовности отчёта / ошибке. */
export async function notifyMeeting(job: NotifyJob): Promise<void> {
  const d = db();
  const [m] = await d.select().from(meetings).where(eq(meetings.id, job.meetingId)).limit(1);
  if (!m) return;
  const userDevices = await d.select().from(devices).where(eq(devices.userId, m.ownerId));
  if (userDevices.length === 0) return;

  let payload: PushPayload;
  if (job.kind === "report_ready") {
    const [r] = await d.select({ title: reports.title }).from(reports).where(eq(reports.meetingId, m.id)).limit(1);
    payload = { title: "Отчёт готов", body: r?.title ?? m.title, data: { meetingId: m.id, kind: "report_ready" }, threadId: m.id };
  } else {
    payload = { title: "Не удалось обработать запись", body: m.error ?? m.title, data: { meetingId: m.id, kind: "failed" }, threadId: m.id };
  }

  for (const dev of userDevices) {
    if (dev.platform !== "ios") continue;
    const res = await sendApns(dev.pushToken, payload);
    if (res === "invalid_token") await d.delete(devices).where(eq(devices.id, dev.id));
    if (res === "disabled") {
      logger.info({ meetingId: m.id, kind: job.kind }, "APNs не настроен — push пропущен");
      return;
    }
  }
}
