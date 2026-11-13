import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, UserRow } from "./types";
import { publicUser, requireAuth } from "./auth";
import { isSlackWebhookUrl, sendEmail, sendSlack } from "./notify";
import { randomToken, signJwt, verifyJwt } from "./crypto";

async function loadUser(db: D1Database, id: string): Promise<UserRow> {
  return (await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>())!;
}

// ---------- /api/me, /api/settings, /api/notifications (authenticated) ----------

export const settingsRoutes = new Hono<AppEnv>();
settingsRoutes.use("*", requireAuth);

settingsRoutes.get("/me", async (c) => c.json(publicUser(await loadUser(c.env.DB, c.var.userId))));

/**
 * Permanently delete the signed-in user and everything they own. Child rows are deleted explicitly
 * (rather than relying on ON DELETE CASCADE) so this works whether or not foreign keys are enforced.
 * The body must include the account's email as confirmation.
 */
settingsRoutes.delete("/me", async (c) => {
  const { confirm } = (await c.req.json().catch(() => ({}))) as { confirm?: string };
  const user = await loadUser(c.env.DB, c.var.userId);
  if (typeof confirm !== "string" || confirm.trim().toLowerCase() !== user.email.toLowerCase()) {
    return c.json({ error: "Type your email address exactly to confirm." }, 400);
  }
  const db = c.env.DB;
  await db.batch([
    db.prepare("DELETE FROM notification_log WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM tasks WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM oauth_accounts WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return c.json({ deleted: true });
});

settingsRoutes.put("/settings", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const sets: string[] = [];
  const args: unknown[] = [];

  if (typeof body.email_notifications === "boolean") {
    sets.push("email_notifications = ?");
    args.push(body.email_notifications ? 1 : 0);
  }
  if (typeof body.slack_notifications === "boolean") {
    sets.push("slack_notifications = ?");
    args.push(body.slack_notifications ? 1 : 0);
  }
  if ("slack_webhook_url" in body) {
    const url = body.slack_webhook_url;
    if (url === null || url === "") {
      sets.push("slack_webhook_url = NULL", "slack_channel = NULL", "slack_notifications = 0");
    } else if (typeof url === "string" && isSlackWebhookUrl(url.trim())) {
      sets.push("slack_webhook_url = ?", "slack_channel = NULL", "slack_notifications = 1");
      args.push(url.trim());
    } else {
      return c.json({ error: "Slack webhook URL must look like https://hooks.slack.com/services/..." }, 400);
    }
  }
  if (sets.length) {
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...args, c.var.userId).run();
  }
  const user = await loadUser(c.env.DB, c.var.userId);
  if (user.slack_notifications && !user.slack_webhook_url) {
    await c.env.DB.prepare("UPDATE users SET slack_notifications = 0 WHERE id = ?").bind(c.var.userId).run();
    user.slack_notifications = 0;
  }
  return c.json(publicUser(user));
});

settingsRoutes.delete("/slack", async (c) => {
  await c.env.DB.prepare(
    "UPDATE users SET slack_webhook_url = NULL, slack_channel = NULL, slack_notifications = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  )
    .bind(c.var.userId)
    .run();
  return c.json(publicUser(await loadUser(c.env.DB, c.var.userId)));
});

/** Short-lived ticket the browser uses to start the "Add to Slack" redirect flow. */
settingsRoutes.post("/slack/ticket", async (c) => {
  if (!c.env.SLACK_CLIENT_ID || !c.env.SLACK_CLIENT_SECRET) return c.json({ error: "Slack app is not configured on the server" }, 501);
  const ticket = await signJwt({ sub: c.var.userId, purpose: "slack-ticket" }, c.env.JWT_SECRET, 120);
  return c.json({ url: `${c.env.API_URL.replace(/\/$/, "")}/integrations/slack/install?ticket=${encodeURIComponent(ticket)}` });
});

settingsRoutes.post("/notifications/test", async (c) => {
  const { channel } = (await c.req.json().catch(() => ({}))) as { channel?: string };
  const user = await loadUser(c.env.DB, c.var.userId);
  const sample = {
    title: "Sample task",
    description: "This is a test notification from Task(AI)Do.",
    due_date: new Date(Date.now() + 3_600_000).toISOString(),
    priority: "Medium",
  };
  try {
    if (channel === "email") {
      await sendEmail(c.env, user.email, "test", sample);
    } else if (channel === "slack") {
      if (!user.slack_webhook_url) return c.json({ error: "Slack is not connected" }, 400);
      await sendSlack(user.slack_webhook_url, "test", sample, c.env.FRONTEND_URL);
    } else {
      return c.json({ error: "channel must be 'email' or 'slack'" }, 400);
    }
  } catch (e) {
    await c.env.DB.prepare("INSERT INTO notification_log (user_id, channel, kind, success, error) VALUES (?, ?, 'test', 0, ?)")
      .bind(user.id, channel, String((e as Error).message))
      .run();
    return c.json({ error: (e as Error).message }, 502);
  }
  await c.env.DB.prepare("INSERT INTO notification_log (user_id, channel, kind, success) VALUES (?, ?, 'test', 1)").bind(user.id, channel).run();
  return c.json({ ok: true });
});

settingsRoutes.get("/notifications/log", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT l.id, l.task_id, t.title AS task_title, l.channel, l.kind, l.success, l.error, l.created_at
     FROM notification_log l LEFT JOIN tasks t ON t.id = l.task_id
     WHERE l.user_id = ? ORDER BY l.id DESC LIMIT 50`,
  )
    .bind(c.var.userId)
    .all<Record<string, unknown>>();
  return c.json(results.map((r) => ({ ...r, success: Boolean(r.success) })));
});

// ---------- /integrations/slack (browser redirects) ----------

const SLACK_COOKIE = "slack_nonce";
export const slackRoutes = new Hono<AppEnv>();

slackRoutes.get("/install", async (c) => {
  const ticket = await verifyJwt<{ sub: string; purpose: string }>(c.req.query("ticket") ?? "", c.env.JWT_SECRET);
  if (!ticket || ticket.purpose !== "slack-ticket") return c.text("Link expired — go back to Task(AI)Do settings and try again.", 400);

  // Bind the flow to this browser so a third party can't complete it for someone else.
  const nonce = randomToken(16);
  setCookie(c, SLACK_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "Lax", path: "/integrations/slack", maxAge: 600 });
  const state = await signJwt({ sub: ticket.sub, nonce, purpose: "slack-state" }, c.env.JWT_SECRET, 600);

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", c.env.SLACK_CLIENT_ID!);
  url.searchParams.set("scope", "incoming-webhook");
  url.searchParams.set("redirect_uri", `${c.env.API_URL.replace(/\/$/, "")}/integrations/slack/callback`);
  url.searchParams.set("state", state);
  return c.redirect(url.toString());
});

slackRoutes.get("/callback", async (c) => {
  const back = (params: Record<string, string>) =>
    c.redirect(`${c.env.FRONTEND_URL.replace(/\/$/, "")}/settings?${new URLSearchParams(params).toString()}`);

  const nonce = getCookie(c, SLACK_COOKIE);
  deleteCookie(c, SLACK_COOKIE, { path: "/integrations/slack", secure: true });
  const { code, state, error } = c.req.query();
  if (error) return back({ slack: "error", message: `Slack install cancelled (${error})` });

  const st = await verifyJwt<{ sub: string; nonce: string; purpose: string }>(state ?? "", c.env.JWT_SECRET);
  if (!code || !st || st.purpose !== "slack-state" || !nonce || st.nonce !== nonce) {
    return back({ slack: "error", message: "Slack install session expired. Please try again." });
  }

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.SLACK_CLIENT_ID!,
      client_secret: c.env.SLACK_CLIENT_SECRET!,
      redirect_uri: `${c.env.API_URL.replace(/\/$/, "")}/integrations/slack/callback`,
    }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    incoming_webhook?: { url: string; channel: string };
    team?: { name: string };
  };
  if (!data.ok || !data.incoming_webhook?.url) return back({ slack: "error", message: `Slack error: ${data.error ?? "no webhook returned"}` });

  const channel = [data.team?.name, data.incoming_webhook.channel].filter(Boolean).join(" · ");
  await c.env.DB.prepare(
    "UPDATE users SET slack_webhook_url = ?, slack_channel = ?, slack_notifications = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  )
    .bind(data.incoming_webhook.url, channel, st.sub)
    .run();
  return back({ slack: "connected" });
});
