import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  api,
  formatDate,
  isoToLocalInput,
  localInputToIso,
  PRIORITIES,
  relativeTime,
  STATUSES,
  type Priority,
  type Status,
  type Task,
  type TaskInput,
} from "../api";
import { PlusIcon, SparkIcon } from "../icons";
import { toast } from "../toast";
import { onDataChanged } from "../events";

type Editing = Task | "new" | null;

/** Quick views, linkable as /tasks?view=… (used by the Dashboard tiles). */
export type TaskView = "" | "open" | "due_soon" | "overdue" | "completed";
const VIEWS: { id: TaskView; label: string }[] = [
  { id: "", label: "All" },
  { id: "open", label: "Open" },
  { id: "due_soon", label: "Due in 24h" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];
const readView = (): TaskView => {
  const v = new URLSearchParams(location.search).get("view");
  return VIEWS.some((x) => x.id === v) ? (v as TaskView) : "";
};

function inView(t: Task, view: TaskView, now: number): boolean {
  const due = t.due_date ? new Date(t.due_date).getTime() : null;
  const open = t.status !== "completed";
  switch (view) {
    case "open":
      return open;
    case "due_soon":
      return open && due !== null && due >= now && due < now + 86_400_000;
    case "overdue":
      return open && due !== null && due < now;
    case "completed":
      return !open;
    default:
      return true;
  }
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<TaskView>(readView);
  // /tasks?new=1 (Dashboard button, home-screen shortcut) opens the New task form.
  const [editing, setEditing] = useState<Editing>(() => (new URLSearchParams(location.search).get("new") ? "new" : null));

  // Keep the view in sync with the URL (Dashboard links, back/forward), and open /tasks?task=ID.
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(location.search);
      setView(readView());
      if (params.get("new")) setEditing("new");
      const id = Number(params.get("task"));
      if (id) {
        api<Task>(`/api/tasks/${id}`)
          .then(setEditing)
          .catch(() => setError("That task no longer exists."));
      }
      // Drop one-shot params so a refresh doesn't reopen the form.
      if (params.has("new") || params.has("task")) {
        params.delete("new");
        params.delete("task");
        const rest = params.toString();
        history.replaceState(null, "", `/tasks${rest ? `?${rest}` : ""}`);
      }
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const chooseView = (v: TaskView) => {
    setView(v);
    history.replaceState(null, "", v ? `/tasks?view=${v}` : "/tasks");
  };

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (q.trim()) params.set("q", q.trim());
    try {
      setTasks(await api<Task[]>(`/api/tasks?${params}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status, priority, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => onDataChanged(load), [load]);

  const update = async (t: Task, body: TaskInput) => {
    try {
      await api(`/api/tasks/${t.id}`, { method: "PUT", body: JSON.stringify(body) });
      load();
      if (body.status === "completed") {
        toast.success("Task completed", {
          detail: t.title,
          action: { label: "Undo", onClick: () => update(t, { status: t.status }) },
        });
      } else if (body.status && t.status === "completed") {
        toast.info("Task reopened", { detail: t.title });
      }
    } catch (e) {
      toast.error("Couldn't update the task", { detail: (e as Error).message });
    }
  };

  const remove = async (t: Task) => {
    if (!confirm(`Delete "${t.title}"?`)) return;
    try {
      await api(`/api/tasks/${t.id}`, { method: "DELETE" });
      load();
      // Undo recreates the task with the same details.
      toast.success("Task deleted", {
        detail: t.title,
        action: {
          label: "Undo",
          onClick: async () => {
            const { title, description, due_date, priority, status, category, tags, is_reminder_set, reminder_time } = t;
            try {
              await api("/api/tasks", {
                method: "POST",
                body: JSON.stringify({ title, description, due_date, priority, status, category, tags, is_reminder_set, reminder_time }),
              });
              load();
              toast.info("Task restored", { detail: t.title });
            } catch (e) {
              toast.error("Couldn't restore the task", { detail: (e as Error).message });
            }
          },
        },
      });
    } catch (e) {
      toast.error("Couldn't delete the task", { detail: (e as Error).message });
    }
  };

  const now = Date.now();
  const shown = tasks.filter((t) => inView(t, view, now));

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Tasks</h1>
        <button className="btn primary" onClick={() => setEditing("new")}>
          <PlusIcon width={16} height={16} /> New task
        </button>
      </div>

      <div className="segmented view-tabs" role="tablist" aria-label="Task view">
        {VIEWS.map((v) => (
          <button key={v.id || "all"} role="tab" aria-selected={view === v.id} className={view === v.id ? "on" : ""} onClick={() => chooseView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="filters">
        <input type="search" placeholder="Search title, tags, category…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="card empty">
          <p>
            {view === "overdue"
              ? "Nothing overdue. Nice."
              : view === "due_soon"
                ? "Nothing due in the next 24 hours."
                : view === "completed"
                  ? "No completed tasks yet."
                  : `No tasks${view || status || priority || q ? " match these filters" : " yet"}.`}
          </p>
          {!view && !status && !priority && !q && (
            <button className="btn primary" onClick={() => setEditing("new")}>
              Create your first task
            </button>
          )}
        </div>
      ) : (
        <ul className="task-list">
          {shown.map((t) => (
            <TaskRow key={t.id} task={t} onEdit={() => setEditing(t)} onUpdate={(b) => update(t, b)} onDelete={() => remove(t)} />
          ))}
        </ul>
      )}

      {editing && (
        <TaskModal
          task={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setEditing(null);
            load();
            toast.success(isNew ? "Task created" : "Task updated", { detail: saved.title });
          }}
        />
      )}
    </div>
  );
}

function TaskRow({ task: t, onEdit, onUpdate, onDelete }: { task: Task; onEdit: () => void; onUpdate: (b: TaskInput) => void; onDelete: () => void }) {
  const done = t.status === "completed";
  const due = t.due_date ? new Date(t.due_date).getTime() : null;
  const urgency = done || due === null ? "" : due < Date.now() ? "overdue" : due - Date.now() < 86_400_000 ? "soon" : "";

  return (
    <li className={`task card ${done ? "done" : ""}`}>
      <input
        type="checkbox"
        className="check"
        checked={done}
        aria-label={done ? "Mark as pending" : "Mark as completed"}
        onChange={() => onUpdate({ status: done ? "pending" : "completed" })}
      />
      <div className="task-body" onClick={onEdit}>
        <div className="task-title">
          {t.title}
          <span className={`badge p-${t.priority.toLowerCase()}`}>{t.priority}</span>
          {t.status === "in_progress" && <span className="badge">In progress</span>}
          {urgency === "overdue" && <span className="badge danger">Overdue</span>}
          {urgency === "soon" && <span className="badge warn">Due soon</span>}
        </div>
        {t.description && <div className="task-desc">{t.description}</div>}
        <div className="task-meta">
          {t.due_date && (
            <span title={formatDate(t.due_date)}>
              Due {formatDate(t.due_date)} · {relativeTime(t.due_date)}
            </span>
          )}
          {t.is_reminder_set && t.reminder_time && (
            <span>
              🔔 {formatDate(t.reminder_time)}
              {t.reminder_sent ? " (sent)" : ""}
            </span>
          )}
          {t.category && <span>📁 {t.category}</span>}
          {t.tags &&
            t.tags
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
              .map((tag) => (
                <span key={tag} className="tag">
                  #{tag}
                </span>
              ))}
        </div>
      </div>
      <div className="task-actions">
        <button className="btn ghost sm" onClick={onEdit}>
          Edit
        </button>
        <button className="btn ghost sm danger-text" onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}

const REMINDER_PRESETS = [
  { label: "At due time", minutes: 0 },
  { label: "15 min before", minutes: 15 },
  { label: "1 hour before", minutes: 60 },
  { label: "1 day before", minutes: 1440 },
];

function defaultDue(): string {
  const d = new Date(Date.now() + 86_400_000);
  d.setMinutes(0, 0, 0);
  return isoToLocalInput(d.toISOString());
}

function TaskModal({ task, onClose, onSaved }: { task: Task | null; onClose: () => void; onSaved: (saved: Task, isNew: boolean) => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [due, setDue] = useState(task ? isoToLocalInput(task.due_date) : defaultDue());
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "Medium");
  const [status, setStatus] = useState<Status>(task?.status ?? "pending");
  const [category, setCategory] = useState(task?.category ?? "");
  const [tags, setTags] = useState(task?.tags ?? "");
  const [reminderOn, setReminderOn] = useState(task?.is_reminder_set ?? true);
  const [reminder, setReminder] = useState(() => {
    if (task?.reminder_time) return isoToLocalInput(task.reminder_time);
    const d = new Date(due);
    return Number.isNaN(d.getTime()) ? "" : isoToLocalInput(new Date(d.getTime() - 3_600_000).toISOString());
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);

  /** Ask the AI for a clearer title/description; fill category/tags/priority only where they're empty or default. */
  const enhance = async () => {
    if (!title.trim()) return setError("Add a title first, then enhance.");
    setEnhancing(true);
    setError(null);
    const before = { title, description, category, tags, priority };
    try {
      const r = await api<{ title?: string; description?: string; category?: string; tags?: string; priority?: Priority }>("/api/assistant/enhance", {
        method: "POST",
        body: JSON.stringify({ title, description, due_date: localInputToIso(due), priority, category, tags }),
      });
      if (r.title) setTitle(r.title);
      if (r.description) setDescription(r.description);
      if (r.category && !category.trim()) setCategory(r.category);
      if (r.tags && !tags.trim()) setTags(r.tags);
      if (r.priority && !task && priority === "Medium") setPriority(r.priority);
      toast.success("Enhanced with AI", {
        detail: "Review the changes, then save.",
        action: {
          label: "Undo",
          onClick: () => {
            setTitle(before.title);
            setDescription(before.description);
            setCategory(before.category);
            setTags(before.tags);
            setPriority(before.priority);
          },
        },
      });
    } catch (e) {
      toast.error("Couldn't enhance the task", { detail: (e as Error).message });
    } finally {
      setEnhancing(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preset = (minutes: number) => {
    if (!due) return;
    setReminder(isoToLocalInput(new Date(new Date(due).getTime() - minutes * 60_000).toISOString()));
    setReminderOn(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError("Title is required");
    if (!due) return setError("Due date is required");
    if (reminderOn && !reminder) return setError("Pick a reminder time or turn the reminder off");
    const body: TaskInput = {
      title: title.trim(),
      description: description.trim() || null,
      due_date: localInputToIso(due),
      priority,
      status,
      category: category.trim() || null,
      tags: tags.trim() || null,
      is_reminder_set: reminderOn,
      reminder_time: reminderOn ? localInputToIso(reminder) : null,
    };
    setSaving(true);
    try {
      const saved = await api<Task>(task ? `/api/tasks/${task.id}` : "/api/tasks", { method: task ? "PUT" : "POST", body: JSON.stringify(body) });
      onSaved(saved, !task);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal card" onSubmit={submit}>
        <h2>{task ? "Edit task" : "New task"}</h2>
        {error && <div className="alert error">{error}</div>}

        <label>
          Title*
          <input autoFocus value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
        </label>
        <div className="field">
          <div className="field-head">
            <label htmlFor="task-description">Description</label>
            <button type="button" className="btn ai-enhance sm" onClick={enhance} disabled={enhancing || !title.trim()} title="Rewrite the title and description to be clear and actionable">
              <SparkIcon width={14} height={14} />
              {enhancing ? "Enhancing…" : "Enhance with AI"}
            </button>
          </div>
          <textarea
            id="task-description"
            value={description}
            rows={description.split("\n").length > 3 ? 6 : 3}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details, or write a rough note and let AI tidy it up"
            className={enhancing ? "shimmer" : ""}
          />
        </div>

        <div className="row">
          <label>
            Due*
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          {task && (
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="row">
          <label>
            Category
            <input value={category} maxLength={50} onChange={(e) => setCategory(e.target.value)} placeholder="Work, Home…" />
          </label>
          <label>
            Tags
            <input value={tags} maxLength={200} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" />
          </label>
        </div>

        <fieldset className="reminder">
          <label className="toggle-row">
            <input type="checkbox" checked={reminderOn} onChange={(e) => setReminderOn(e.target.checked)} />
            Send me a reminder
          </label>
          {reminderOn && (
            <>
              <input type="datetime-local" value={reminder} onChange={(e) => setReminder(e.target.value)} aria-label="Reminder time" />
              <div className="presets">
                {REMINDER_PRESETS.map((p) => (
                  <button type="button" key={p.minutes} className="btn ghost sm" onClick={() => preset(p.minutes)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="muted small">You'll also get an alert when the task is due. Choose channels in Settings.</p>
        </fieldset>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : task ? "Save" : "Create task"}
          </button>
        </div>
      </form>
    </div>
  );
}
