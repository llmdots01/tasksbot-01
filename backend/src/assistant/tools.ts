import type { Env } from "../types";
import { PRIORITIES, STATUSES } from "../types";
import { createTask, deleteTask, getTask, listTasks, taskStats, updateTask, ValidationError, type TaskInput } from "../tasks";
import { disconnectSlack, loadUser, notificationLog, sendTestNotification, SettingsError, updateNotificationSettings } from "../settings";
import { publicUser } from "../auth";
import { pushDeviceCount } from "../push";

/** Provider-neutral tool definition (JSON Schema subset understood by both Gemini and OpenAI-style APIs). */
export interface ToolDef {
  name: string;
  description: string;
  parameters?: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

/** A change the assistant made, shown as a chip in the chat and used to refresh the page. */
export interface ToolAction {
  tool: string;
  label: string;
}

const isoDesc = "ISO 8601 date-time including the user's UTC offset, e.g. 2026-11-15T18:00:00+05:30";
const taskFields = {
  title: { type: "string", description: "Short task title (max 100 chars)" },
  description: { type: "string", description: "Optional details" },
  due_date: { type: "string", description: isoDesc },
  priority: { type: "string", enum: [...PRIORITIES] },
  category: { type: "string", description: "e.g. Work, Home, Health" },
  tags: { type: "string", description: "Comma-separated tags" },
  reminder_minutes_before: {
    type: "integer",
    description: "Send a reminder this many minutes before the due date (e.g. 15, 60, 1440). Use instead of reminder_time when the user gives a lead time.",
  },
  reminder_time: { type: "string", description: `Exact reminder time. ${isoDesc}` },
};

export const TOOLS: ToolDef[] = [
  {
    name: "list_tasks",
    description: "List the user's tasks, soonest due first. Use this to find a task's id before updating, completing or deleting it.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: [...STATUSES] },
        priority: { type: "string", enum: [...PRIORITIES] },
        query: { type: "string", description: "Text to search in title, description, tags and category" },
        limit: { type: "integer", description: "Max results (default 50)" },
      },
    },
  },
  {
    name: "get_task_stats",
    description: "Counts of total, pending, in-progress, completed, overdue and due-in-24h tasks, plus completion rate.",
  },
  {
    name: "create_task",
    description: "Create a new task for the user.",
    parameters: { type: "object", properties: taskFields, required: ["title", "due_date"] },
  },
  {
    name: "update_task",
    description:
      "Change an existing task: edit fields, set status (pending, in_progress, completed), or change/remove its reminder. Only include fields that change.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Task id from list_tasks" },
        ...taskFields,
        status: { type: "string", enum: [...STATUSES] },
        reminder_enabled: { type: "boolean", description: "false removes the reminder" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_task",
    description:
      "Permanently delete a task. Ask the user to confirm first, naming the task, and only call with confirmed=true after they agree in this conversation.",
    parameters: {
      type: "object",
      properties: { id: { type: "integer" }, confirmed: { type: "boolean" } },
      required: ["id", "confirmed"],
    },
  },
  {
    name: "get_notification_settings",
    description:
      "The user's email address, whether email and Slack notifications are on and Slack is connected, and how many devices have phone push notifications enabled.",
  },
  {
    name: "update_notification_settings",
    description:
      "Turn email or Slack notifications on/off, or connect Slack with an incoming webhook URL the user provides (https://hooks.slack.com/services/...).",
    parameters: {
      type: "object",
      properties: {
        email_notifications: { type: "boolean" },
        slack_notifications: { type: "boolean" },
        slack_webhook_url: { type: "string" },
        slack_mention: {
          type: "string",
          description:
            "Who Slack reminders @mention so Slack sends a phone notification: 'channel' for @channel, a Slack member ID like U01ABC2DEF, or 'none'.",
        },
      },
    },
  },
  {
    name: "send_test_notification",
    description: "Send a test notification to check a channel works.",
    parameters: { type: "object", properties: { channel: { type: "string", enum: ["email", "slack", "push"] } }, required: ["channel"] },
  },
  {
    name: "disconnect_slack",
    description: "Disconnect Slack. Ask the user to confirm first and only call with confirmed=true after they agree.",
    parameters: { type: "object", properties: { confirmed: { type: "boolean" } }, required: ["confirmed"] },
  },
  {
    name: "get_notification_history",
    description: "Recent notification deliveries (reminders, due alerts, tests) with success or error.",
    parameters: {
      type: "object",
      properties: { channel: { type: "string", enum: ["email", "slack", "push"] }, limit: { type: "integer" } },
    },
  },
];

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);

/** Map tool args to the task API's input shape, resolving reminder_minutes_before against the due date. */
function toTaskInput(args: Record<string, unknown>, existingDue?: string | null): TaskInput {
  const input: TaskInput = {};
  for (const k of ["title", "description", "due_date", "priority", "category", "tags", "status"] as const) {
    if (args[k] !== undefined && args[k] !== null) (input as Record<string, unknown>)[k] = args[k];
  }
  const minutes = num(args.reminder_minutes_before);
  const due = str(args.due_date) ?? existingDue ?? undefined;
  if (minutes !== undefined && due) {
    const d = new Date(due);
    if (!Number.isNaN(d.getTime())) {
      input.reminder_time = new Date(d.getTime() - minutes * 60_000).toISOString();
      input.is_reminder_set = true;
    }
  } else if (str(args.reminder_time)) {
    input.reminder_time = str(args.reminder_time)!;
    input.is_reminder_set = true;
  }
  if (args.reminder_enabled === false) {
    input.is_reminder_set = false;
    input.reminder_time = null;
  }
  return input;
}

/** Strip noisy fields before handing a task back to the model. */
const brief = (t: Record<string, unknown>) => ({
  id: t.id,
  title: t.title,
  description: t.description ?? undefined,
  due_date: t.due_date,
  priority: t.priority,
  status: t.status,
  category: t.category ?? undefined,
  tags: t.tags ?? undefined,
  reminder_time: t.is_reminder_set ? t.reminder_time : undefined,
});

/**
 * Run one tool call as `userId`. Never throws: errors come back as { error } so the model can explain
 * or retry. Mutating tools also return an action for the UI.
 */
export async function runTool(
  env: Env,
  userId: string,
  name: string,
  rawArgs: unknown,
): Promise<{ result: Record<string, unknown>; action?: ToolAction }> {
  const args = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const db = env.DB;
  try {
    switch (name) {
      case "list_tasks": {
        const tasks = await listTasks(db, userId, {
          status: str(args.status),
          priority: str(args.priority),
          q: str(args.query),
          limit: Math.min(num(args.limit) ?? 50, 100),
        });
        return { result: { count: tasks.length, tasks: tasks.map(brief) } };
      }
      case "get_task_stats":
        return { result: await taskStats(db, userId) };
      case "create_task": {
        const task = await createTask(db, userId, toTaskInput(args));
        return { result: { created: brief(task) }, action: { tool: name, label: `Created “${task.title}”` } };
      }
      case "update_task": {
        const id = num(args.id);
        if (!id) return { result: { error: "id is required" } };
        const existing = await getTask(db, userId, id);
        if (!existing) return { result: { error: `No task with id ${id}` } };
        const task = await updateTask(db, userId, id, toTaskInput(args, existing.due_date));
        const label =
          args.status === "completed" ? `Completed “${task!.title}”` : args.status === "pending" && existing.status === "completed" ? `Reopened “${task!.title}”` : `Updated “${task!.title}”`;
        return { result: { updated: brief(task!) }, action: { tool: name, label } };
      }
      case "delete_task": {
        const id = num(args.id);
        if (args.confirmed !== true) return { result: { error: "Ask the user to confirm the deletion first, then call again with confirmed=true." } };
        const existing = id ? await getTask(db, userId, id) : null;
        if (!existing) return { result: { error: `No task with id ${id}` } };
        await deleteTask(db, userId, id!);
        return { result: { deleted: existing.title }, action: { tool: name, label: `Deleted “${existing.title}”` } };
      }
      case "get_notification_settings":
        return { result: { ...publicUser(await loadUser(db, userId)), push_devices: await pushDeviceCount(db, userId) } };
      case "update_notification_settings": {
        const body: Record<string, unknown> = {};
        for (const k of ["email_notifications", "slack_notifications", "slack_webhook_url", "slack_mention"]) if (k in args) body[k] = args[k];
        const user = publicUser(await updateNotificationSettings(db, userId, body));
        const parts = [
          "email_notifications" in body && `email ${user.email_notifications ? "on" : "off"}`,
          ("slack_notifications" in body || "slack_webhook_url" in body) && `Slack ${user.slack_notifications ? "on" : "off"}`,
          "slack_mention" in body && `Slack mentions ${user.slack_mention ? (user.slack_mention === "channel" ? "@channel" : "you") : "off"}`,
        ].filter(Boolean);
        return { result: user, action: { tool: name, label: `Notifications: ${parts.join(", ") || "updated"}` } };
      }
      case "send_test_notification": {
        await sendTestNotification(env, await loadUser(db, userId), args.channel);
        return { result: { sent: true, channel: args.channel }, action: { tool: name, label: `Sent test ${args.channel}` } };
      }
      case "disconnect_slack": {
        if (args.confirmed !== true) return { result: { error: "Ask the user to confirm first, then call again with confirmed=true." } };
        await disconnectSlack(db, userId);
        return { result: { disconnected: true }, action: { tool: name, label: "Disconnected Slack" } };
      }
      case "get_notification_history":
        return { result: { deliveries: await notificationLog(db, userId, { channel: str(args.channel), limit: Math.min(num(args.limit) ?? 20, 50) }) } };
      default:
        return { result: { error: `Unknown tool ${name}` } };
    }
  } catch (e) {
    if (e instanceof ValidationError || e instanceof SettingsError) return { result: { error: e.message } };
    console.error("assistant tool failed", name, e);
    return { result: { error: e instanceof Error ? e.message : "Tool failed" } };
  }
}
