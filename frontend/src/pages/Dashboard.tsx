import { useEffect, useState } from "react";
import { api, formatDate, relativeTime, type Stats, type Task, type User } from "../api";
import { navigate } from "../router";

export default function Dashboard({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [upcoming, setUpcoming] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<Stats>("/api/tasks/statistics"), api<Task[]>("/api/tasks?limit=200")])
      .then(([s, tasks]) => {
        setStats(s);
        setUpcoming(tasks.filter((t) => t.status !== "completed" && t.due_date).slice(0, 6));
      })
      .catch((e) => setError(e.message));
  }, []);

  const noChannels = !user.email_notifications && !(user.slack_notifications && user.slack_connected);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Hi{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
        <button className="btn primary" onClick={() => navigate("/tasks")}>
          + New task
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {noChannels && (
        <div className="alert warn">
          All notifications are off, so reminders won't reach you.{" "}
          <a href="/settings" onClick={(e) => (e.preventDefault(), navigate("/settings"))}>
            Turn on email or Slack
          </a>
          .
        </div>
      )}

      <div className="stats">
        <StatTile label="Total" value={stats?.total} />
        <StatTile label="Pending" value={stats ? stats.pending + stats.in_progress : undefined} />
        <StatTile label="Due in 24h" value={stats?.due_soon} tone="warn" />
        <StatTile label="Overdue" value={stats?.overdue} tone="danger" />
        <StatTile label="Completed" value={stats ? `${stats.completion_rate}%` : undefined} tone="ok" />
      </div>

      <section className="card">
        <h2>Coming up</h2>
        {upcoming.length === 0 ? (
          <p className="muted">Nothing due. Nice.</p>
        ) : (
          <ul className="upcoming">
            {upcoming.map((t) => {
              const overdue = new Date(t.due_date!).getTime() < Date.now();
              return (
                <li key={t.id}>
                  <span className={`dot p-${t.priority.toLowerCase()}`} />
                  <span className="grow">{t.title}</span>
                  <span className={overdue ? "danger-text" : "muted"} title={formatDate(t.due_date)}>
                    {relativeTime(t.due_date!)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Notifications</h2>
        <div className="channels">
          <span className={`chip ${user.email_notifications ? "on" : ""}`}>Email {user.email_notifications ? "on" : "off"}</span>
          <span className={`chip ${user.slack_notifications && user.slack_connected ? "on" : ""}`}>
            Slack {user.slack_connected ? (user.slack_notifications ? "on" : "off") : "not connected"}
          </span>
        </div>
      </section>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number | string | undefined; tone?: string }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <div className="stat-value">{value ?? "–"}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
