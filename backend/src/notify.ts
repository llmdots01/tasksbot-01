import type { Env, TaskRow, UserRow } from "./types";

export type NotificationKind = "reminder" | "due" | "test";
type Channel = "email" | "slack";

const BATCH = 50;

export function isSlackWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "hooks.slack.com" && u.pathname.startsWith("/services/");
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function escapeSlack(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function headline(kind: NotificationKind, task: Pick<TaskRow, "title">): string {
  if (kind === "due") return `Task due now: ${task.title}`;
  if (kind === "test") return "TasksBot test notification";
  return `Reminder: ${task.title}`;
}

/** Slack date token renders in each viewer's own timezone. */
function slackDate(iso: string): string {
  const ts = Math.floor(new Date(iso).getTime() / 1000);
  return `<!date^${ts}^{date_short_pretty} at {time}|${iso}>`;
}

function emailDate(iso: string): string {
  return new Date(iso).toUTCString();
}

// ---------- Channels ----------

export async function sendEmail(
  env: Env,
  to: string,
  kind: NotificationKind,
  task: Partial<TaskRow> & Pick<TaskRow, "title">,
  idempotencyKey?: string,
): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
  const subject = headline(kind, task);
  const appUrl = env.FRONTEND_URL.replace(/\/$/, "");
  const rows: string[] = [];
  if (task.description) rows.push(`<p style="margin:0 0 12px;color:#374151">${escapeHtml(task.description)}</p>`);
  if (task.due_date) rows.push(`<p style="margin:0 0 4px"><strong>Due:</strong> ${escapeHtml(emailDate(task.due_date))}</p>`);
  if (task.priority) rows.push(`<p style="margin:0 0 4px"><strong>Priority:</strong> ${escapeHtml(task.priority)}</p>`);
  if (task.category) rows.push(`<p style="margin:0 0 4px"><strong>Category:</strong> ${escapeHtml(task.category)}</p>`);
  if (kind === "test") rows.push(`<p style="margin:0">Email notifications are working.</p>`);

  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f3f4f6;padding:24px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb">
<h2 style="margin:0 0 16px;font-size:18px;color:#111827">${escapeHtml(subject)}</h2>
${rows.join("\n")}
<p style="margin:20px 0 0"><a href="${escapeHtml(appUrl)}/tasks" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open TasksBot</a></p>
<p style="margin:20px 0 0;font-size:12px;color:#6b7280">You can turn off email notifications in <a href="${escapeHtml(appUrl)}/settings">Settings</a>.</p>
</div></body></html>`;
  const text = [subject, task.description, task.due_date ? `Due: ${emailDate(task.due_date)}` : "", `${appUrl}/tasks`]
    .filter(Boolean)
    .join("\n\n");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const body = JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, text });

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.resend.com/emails", { method: "POST", headers, body });
    if (res.ok) return;
    if (res.status === 429 && attempt < 2) {
      const wait = Number(res.headers.get("retry-after")) || 1;
      await new Promise((r) => setTimeout(r, Math.min(wait, 5) * 1000));
      continue;
    }
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

export async function sendSlack(webhookUrl: string, kind: NotificationKind, task: Partial<TaskRow> & Pick<TaskRow, "title">, appUrl: string): Promise<void> {
  if (!isSlackWebhookUrl(webhookUrl)) throw new Error("Invalid Slack webhook URL");
  const emoji = kind === "due" ? ":alarm_clock:" : kind === "test" ? ":white_check_mark:" : ":bell:";
  const title = headline(kind, task);
  const fields: Array<{ type: "mrkdwn"; text: string }> = [];
  if (task.due_date) fields.push({ type: "mrkdwn", text: `*Due*\n${slackDate(task.due_date)}` });
  if (task.priority) fields.push({ type: "mrkdwn", text: `*Priority*\n${escapeSlack(task.priority)}` });
  if (task.category) fields.push({ type: "mrkdwn", text: `*Category*\n${escapeSlack(task.category)}` });

  const blocks: unknown[] = [{ type: "section", text: { type: "mrkdwn", text: `${emoji} *${escapeSlack(title)}*` } }];
  if (task.description) blocks.push({ type: "section", text: { type: "mrkdwn", text: escapeSlack(task.description) } });
  if (kind === "test") blocks.push({ type: "section", text: { type: "mrkdwn", text: "Slack notifications are working." } });
  if (fields.length) blocks.push({ type: "section", fields });
  blocks.push({
    type: "actions",
    elements: [{ type: "button", text: { type: "plain_text", text: "Open TasksBot" }, url: `${appUrl.replace(/\/$/, "")}/tasks` }],
  });

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `${title}`, blocks }),
  });
  if (!res.ok) throw new Error(`Slack ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// ---------- Dispatch ----------

async function log(env: Env, userId: string, taskId: number | null, channel: Channel, kind: NotificationKind, error?: string) {
  await env.DB.prepare("INSERT INTO notification_log (user_id, task_id, channel, kind, success, error) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(userId, taskId, channel, kind, error ? 0 : 1, error ?? null)
    .run();
}

/** Send a notification about `task` on every channel the user has enabled. */
export async function notifyUser(env: Env, user: UserRow, task: TaskRow, kind: NotificationKind): Promise<void> {
  const jobs: Promise<void>[] = [];

  if (user.email_notifications) {
    jobs.push(
      sendEmail(env, user.email, kind, task, `task-${task.id}-${kind}-${kind === "due" ? task.due_date : task.reminder_time}`)
        .then(() => log(env, user.id, task.id, "email", kind))
        .catch((e) => log(env, user.id, task.id, "email", kind, String(e?.message ?? e))),
    );
  }
  if (user.slack_notifications && user.slack_webhook_url) {
    jobs.push(
      sendSlack(user.slack_webhook_url, kind, task, env.FRONTEND_URL)
        .then(() => log(env, user.id, task.id, "slack", kind))
        .catch((e) => log(env, user.id, task.id, "slack", kind, String(e?.message ?? e))),
    );
  }
  await Promise.all(jobs);
}

/**
 * Cron entry point. Atomically claims tasks whose reminder/due time has passed (so overlapping
 * runs never double-send) and notifies their owners.
 */
export async function processDueNotifications(env: Env, now = new Date()): Promise<{ reminders: number; due: number }> {
  const nowIso = now.toISOString();

  const reminders = await env.DB.prepare(
    `UPDATE tasks SET reminder_sent = 1
     WHERE id IN (SELECT id FROM tasks
                  WHERE is_reminder_set = 1 AND reminder_sent = 0 AND reminder_time IS NOT NULL
                    AND reminder_time <= ? AND status != 'completed'
                  ORDER BY reminder_time LIMIT ${BATCH})
     RETURNING *`,
  )
    .bind(nowIso)
    .all<TaskRow>();

  const due = await env.DB.prepare(
    `UPDATE tasks SET due_notified = 1
     WHERE id IN (SELECT id FROM tasks
                  WHERE due_notified = 0 AND due_date IS NOT NULL AND due_date <= ? AND status != 'completed'
                  ORDER BY due_date LIMIT ${BATCH})
     RETURNING *`,
  )
    .bind(nowIso)
    .all<TaskRow>();

  const items: Array<[TaskRow, NotificationKind]> = [
    ...reminders.results.map((t) => [t, "reminder"] as [TaskRow, NotificationKind]),
    ...due.results.map((t) => [t, "due"] as [TaskRow, NotificationKind]),
  ];
  if (!items.length) return { reminders: 0, due: 0 };

  const userIds = [...new Set(items.map(([t]) => t.user_id))];
  const placeholders = userIds.map(() => "?").join(",");
  const users = await env.DB.prepare(`SELECT * FROM users WHERE id IN (${placeholders})`).bind(...userIds).all<UserRow>();
  const byId = new Map(users.results.map((u) => [u.id, u]));

  // Sequential to stay within Resend's per-second rate limit.
  for (const [task, kind] of items) {
    const user = byId.get(task.user_id);
    if (user) await notifyUser(env, user, task, kind);
  }
  return { reminders: reminders.results.length, due: due.results.length };
}
