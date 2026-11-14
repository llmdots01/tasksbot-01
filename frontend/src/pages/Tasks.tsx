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
import { PlusIcon } from "../icons";
import { onDataChanged } from "../events";

type Editing = Task | "new" | null;

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Editing>(null);

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

  const update = async (id: number, body: TaskInput) => {
    try {
      await api(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(body) });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (t: Task) => {
    if (!confirm(`Delete "${t.title}"?`)) return;
    try {
      await api(`/api/tasks/${t.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Tasks</h1>
        <button className="btn primary" onClick={() => setEditing("new")}>
          <PlusIcon width={16} height={16} /> New task
        </button>
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
      ) : tasks.length === 0 ? (
        <div className="card empty">
          <p>No tasks{status || priority || q ? " match these filters" : " yet"}.</p>
          {!status && !priority && !q && (
            <button className="btn primary" onClick={() => setEditing("new")}>
              Create your first task
            </button>
          )}
        </div>
      ) : (
        <ul className="task-list">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onEdit={() => setEditing(t)} onUpdate={(b) => update(t.id, b)} onDelete={() => remove(t)} />
          ))}
        </ul>
      )}

      {editing && (
        <TaskModal
          task={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
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

function TaskModal({ task, onClose, onSaved }: { task: Task | null; onClose: () => void; onSaved: () => void }) {
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
      await api(task ? `/api/tasks/${task.id}` : "/api/tasks", { method: task ? "PUT" : "POST", body: JSON.stringify(body) });
      onSaved();
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
        <label>
          Description
          <textarea value={description} rows={3} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        </label>

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
