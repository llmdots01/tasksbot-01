import { Hono } from "hono";
import type { AppEnv, Env } from "./types";
import { requireAuth } from "./auth";
import { isPushEndpoint, sendPush, type VapidConfig } from "./webpush";

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function vapidConfig(env: Env): VapidConfig | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKeyJwk: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || env.FRONTEND_URL };
}

export async function pushDeviceCount(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?").bind(userId).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Send `message` to every device the user enabled. Dead subscriptions (404/410) are removed.
 * Returns null when push isn't configured or the user has no devices (nothing to log).
 */
export async function sendPushToUser(
  env: Env,
  userId: string,
  message: Record<string, unknown>,
  topic?: string,
): Promise<{ sent: number; failed: number; error?: string } | null> {
  const vapid = vapidConfig(env);
  if (!vapid) return null;
  const { results } = await env.DB.prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?").bind(userId).all<SubRow>();
  if (!results.length) return null;

  const outcomes = await Promise.all(results.map((s) => sendPush(s, message, vapid, { topic })));
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  let sent = 0;
  let error: string | undefined;
  outcomes.forEach((o, i) => {
    if (o.ok) {
      sent++;
      stmts.push(env.DB.prepare("UPDATE push_subscriptions SET last_success_at = ? WHERE id = ?").bind(now, results[i].id));
    } else {
      error = o.error;
      if (o.gone) stmts.push(env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(results[i].id));
    }
  });
  if (stmts.length) await env.DB.batch(stmts);
  return { sent, failed: results.length - sent, error };
}

// ---------- /api/push ----------

export const pushRoutes = new Hono<AppEnv>();
pushRoutes.use("*", requireAuth);

pushRoutes.get("/status", async (c) => {
  const vapid = vapidConfig(c.env);
  return c.json({ configured: Boolean(vapid), publicKey: vapid?.publicKey ?? null, devices: await pushDeviceCount(c.env.DB, c.var.userId) });
});

pushRoutes.post("/subscribe", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!isPushEndpoint(endpoint) || endpoint.length > 1000) return c.json({ error: "Unsupported push endpoint" }, 400);
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return c.json({ error: "Invalid subscription keys" }, 400);

  // A device belongs to whoever subscribed last on it.
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent`,
  )
    .bind(c.var.userId, endpoint, p256dh, auth, (c.req.header("User-Agent") ?? "").slice(0, 300))
    .run();
  return c.json({ ok: true, devices: await pushDeviceCount(c.env.DB, c.var.userId) });
});

pushRoutes.post("/unsubscribe", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint === "string") {
    await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").bind(body.endpoint, c.var.userId).run();
  }
  return c.json({ ok: true, devices: await pushDeviceCount(c.env.DB, c.var.userId) });
});
