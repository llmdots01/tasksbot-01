import { useEffect, useState } from "react";
import { api, formatDate, relativeTime, type Stats, type Task, type User } from "../api";
import { navigate } from "../router";
import { MailIcon, PlusIcon, SlackLogo } from "../icons";
import { onDataChanged } from "../events";

export default function Dashboard({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [upcoming, setUpcoming] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      Promise.all([api<Stats>("/api/tasks/statistics"), api<Task[]>("/api/tasks?limit=200")])
        .then(([s, tasks]) => {
          setStats(s);
          setUpcoming(tasks.filter((t) => t.status !== "completed" && t.due_date).slice(0, 6));
        })
        .catch((e) => setError(e.message));
    load();
    return onDataChanged(load);
  }, []);

  const slackOn = user.slack_notifications && user.slack_connected;
  const noChannels = !user.email_notifications && !slackOn;
  const first = user.name?.split(" ")[0];
  const goSettings = (e: React.MouseEvent) => (e.preventDefault(), navigate("/settings"));

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>
            Welcome back{first ? ", " : ""}
            {first && <span className="grad-text">{first}</span>}
          </h1>
          <p className="muted">
            {stats ? `${stats.pending + stats.in_progress} open task${stats.pending + stats.in_progress === 1 ? "" : "s"}` : "Loading your tasks…"}
            {stats && stats.overdue > 0 ? ` · ${stats.overdue} overdue` : ""}
          </p>
        </div>
        <button className="btn primary" onClick={() => navigate("/tasks")}>
          <PlusIcon width={16} height={16} /> New task
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {noChannels && (
        <div className="alert warn">
          All notifications are off, so reminders won't reach you.{" "}
          <a href="/settings" onClick={goSettings}>
            Turn on email or Slack
          </a>
          .
        </div>
      )}

      <div className="stats">
        <StatTile label="Total tasks" value={stats?.total} />
        <StatTile label="Open" value={stats ? stats.pending + stats.in_progress : undefined} tone="accent" />
        <StatTile label="Due in 24h" value={stats?.due_soon} tone="warn" />
        <StatTile label="Overdue" value={stats?.overdue} tone="danger" />
        <StatTile label="Completed" value={stats ? `${stats.completion_rate}%` : undefined} tone="ok" />
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Coming up</div>
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
          <div className="eyebrow" style={{ marginBottom: 12 }}>Notifications</div>
          <div className="channels">
            <span className={`chip ${user.email_notifications ? "on" : ""}`}>
              <MailIcon /> Email {user.email_notifications ? "on" : "off"}
            </span>
            <span className={`chip ${slackOn ? "on" : ""}`}>
              <SlackLogo size={15} /> Slack {user.slack_connected ? (user.slack_notifications ? "on" : "off") : "not connected"}
            </span>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            <a href="/settings" onClick={goSettings}>
              Manage channels →
            </a>
          </p>
        </section>
      </div>
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
