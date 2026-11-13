import { Hono } from "hono";
import type { AppEnv, TaskRow } from "./types";
import { PRIORITIES, STATUSES } from "./types";

type TaskInput = {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  priority?: string;
  status?: string;
  category?: string | null;
  tags?: string | null;
  is_reminder_set?: boolean;
  reminder_time?: string | null;
};

class ValidationError extends Error {}

function toIso(v: unknown, field: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") throw new ValidationError(`${field} must be an ISO date string`);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} is not a valid date`);
  return d.toISOString();
}

function optString(v: unknown, field: string, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new ValidationError(`${field} must be a string`);
  const s = v.trim();
  if (s.length > max) throw new ValidationError(`${field} must be at most ${max} characters`);
  return s || null;
}

/** Validate a create (partial=false) or update (partial=true) payload into DB column values. */
function parseTask(body: TaskInput, partial: boolean): Record<string, unknown> {
  if (typeof body !== "object" || body === null) throw new ValidationError("Body must be a JSON object");
  const out: Record<string, unknown> = {};
  const has = (k: keyof TaskInput) => Object.prototype.hasOwnProperty.call(body, k);

  if (!partial || has("title")) {
    const title = optString(body.title, "title", 100);
    if (!title) throw new ValidationError("title is required");
    out.title = title;
  }
  if (has("description")) out.description = optString(body.description, "description", 2000);
  if (has("category")) out.category = optString(body.category, "category", 50);
  if (has("tags")) out.tags = optString(body.tags, "tags", 200);
  if (has("due_date")) out.due_date = toIso(body.due_date, "due_date");
  if (has("reminder_time")) out.reminder_time = toIso(body.reminder_time, "reminder_time");
  if (has("priority")) {
    if (!PRIORITIES.includes(body.priority as (typeof PRIORITIES)[number]))
      throw new ValidationError(`priority must be one of ${PRIORITIES.join(", ")}`);
    out.priority = body.priority;
  }
  if (has("status")) {
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number]))
      throw new ValidationError(`status must be one of ${STATUSES.join(", ")}`);
    out.status = body.status;
  }
  if (has("is_reminder_set")) out.is_reminder_set = body.is_reminder_set ? 1 : 0;

  if (!partial && out.due_date === undefined) throw new ValidationError("due_date is required");
  return out;
}

export function serializeTask(t: TaskRow) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    due_date: t.due_date,
    priority: t.priority,
    status: t.status,
    category: t.category,
    tags: t.tags,
    is_reminder_set: Boolean(t.is_reminder_set),
    reminder_time: t.reminder_time,
    reminder_sent: Boolean(t.reminder_sent),
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

export const taskRoutes = new Hono<AppEnv>();

taskRoutes.onError((err, c) => {
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
  if (err instanceof SyntaxError) return c.json({ error: "Invalid JSON body" }, 400);
  throw err;
});

taskRoutes.get("/", async (c) => {
  const { status, priority, q } = c.req.query();
  const where = ["user_id = ?"];
  const args: unknown[] = [c.var.userId];
  if (status) {
    where.push("status = ?");
    args.push(status);
  }
  if (priority) {
    where.push("priority = ?");
    args.push(priority);
  }
  if (q) {
    where.push("(title LIKE ? OR description LIKE ? OR tags LIKE ? OR category LIKE ?)");
    const like = `%${q}%`;
    args.push(like, like, like, like);
  }
  const limit = Math.min(Number(c.req.query("limit")) || 200, 500);
  const offset = Math.max(Number(c.req.query("skip")) || 0, 0);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM tasks WHERE ${where.join(" AND ")}
     ORDER BY (status = 'completed'), due_date IS NULL, due_date LIMIT ? OFFSET ?`,
  )
    .bind(...args, limit, offset)
    .all<TaskRow>();
  return c.json(results.map(serializeTask));
});

taskRoutes.get("/statistics", async (c) => {
  const now = new Date().toISOString();
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(status = 'completed') AS completed,
            SUM(status = 'pending') AS pending,
            SUM(status = 'in_progress') AS in_progress,
            SUM(status != 'completed' AND due_date IS NOT NULL AND due_date < ?) AS overdue,
            SUM(status != 'completed' AND due_date >= ? AND due_date < ?) AS due_soon
     FROM tasks WHERE user_id = ?`,
  )
    .bind(now, now, new Date(Date.now() + 86_400_000).toISOString(), c.var.userId)
    .first<Record<string, number | null>>();
  const total = row?.total ?? 0;
  const completed = row?.completed ?? 0;
  return c.json({
    total,
    completed,
    pending: row?.pending ?? 0,
    in_progress: row?.in_progress ?? 0,
    overdue: row?.overdue ?? 0,
    due_soon: row?.due_soon ?? 0,
    completion_rate: total ? Math.round((completed / total) * 1000) / 10 : 0,
  });
});

taskRoutes.get("/:id{[0-9]+}", async (c) => {
  const task = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?")
    .bind(Number(c.req.param("id")), c.var.userId)
    .first<TaskRow>();
  return task ? c.json(serializeTask(task)) : c.json({ error: "Task not found" }, 404);
});

taskRoutes.post("/", async (c) => {
  const data = parseTask(await c.req.json(), false);
  const now = new Date().toISOString();
  // A task created with a past due date shouldn't trigger an immediate "due" alert.
  data.due_notified = data.due_date && (data.due_date as string) <= now ? 1 : 0;
  data.user_id = c.var.userId;

  const cols = Object.keys(data);
  const task = await c.env.DB.prepare(
    `INSERT INTO tasks (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING *`,
  )
    .bind(...cols.map((k) => data[k]))
    .first<TaskRow>();
  return c.json(serializeTask(task!), 201);
});

taskRoutes.put("/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").bind(id, c.var.userId).first<TaskRow>();
  if (!existing) return c.json({ error: "Task not found" }, 404);

  const data = parseTask(await c.req.json(), true);
  const now = new Date().toISOString();
  // Re-arm notifications when their time changes.
  if ("reminder_time" in data && data.reminder_time !== existing.reminder_time) data.reminder_sent = 0;
  if ("is_reminder_set" in data && data.is_reminder_set && !existing.is_reminder_set) data.reminder_sent = 0;
  if ("due_date" in data && data.due_date !== existing.due_date) {
    data.due_notified = data.due_date && (data.due_date as string) <= now ? 1 : 0;
  }
  if (!Object.keys(data).length) return c.json(serializeTask(existing));
  data.updated_at = now;

  const cols = Object.keys(data);
  const task = await c.env.DB.prepare(
    `UPDATE tasks SET ${cols.map((k) => `${k} = ?`).join(", ")} WHERE id = ? AND user_id = ? RETURNING *`,
  )
    .bind(...cols.map((k) => data[k]), id, c.var.userId)
    .first<TaskRow>();
  return c.json(serializeTask(task!));
});

taskRoutes.delete("/:id{[0-9]+}", async (c) => {
  const res = await c.env.DB.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").bind(Number(c.req.param("id")), c.var.userId).run();
  return res.meta.changes ? c.json({ message: "Task deleted successfully" }) : c.json({ error: "Task not found" }, 404);
});
