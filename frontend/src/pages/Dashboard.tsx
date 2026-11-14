import { useEffect, useState } from "react";
import { api, formatDate, relativeTime, type Stats, type Task, type User } from "../api";
import { navigate } from "../router";
import { BellIcon, MailIcon, PlusIcon, SlackLogo } from "../icons";
import { onDataChanged } from "../events";

export default function Dashboard({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [upcoming, setUpcoming] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pushDevices, setPushDevices] = useState<number | null>(null);

  useEffect(() => {
    api<{ devices: number }>("/api/push/status").then((s) => setPushDevices(s.devices)).catch(() => {});
  }, []);

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
  const noChannels = !user.email_notifications && !slackOn && !pushDevices;
  const first = user.name?.split(" ")[0];
  /** onClick for in-app links that keeps normal <a> behaviour (new tab with Ctrl/Cmd-click). */
  const go = (to: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  const goSettings = go("/settings");
  const open = stats ? stats.pending + stats.in_progress : 0;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>
            Welcome back{first ? ", " : ""}
            {first && <span className="grad-text">{first}</span>}
          </h1>
          <p className="muted">
            {stats ? (
              <>
                <a className="subtle-link" href="/tasks?view=open" onClick={go("/tasks?view=open")}>
                  {open} open task{open === 1 ? "" : "s"}
                </a>
                {stats.overdue > 0 && (
                  <>
                    {" · "}
                    <a className="subtle-link danger-text" href="/tasks?view=overdue" onClick={go("/tasks?view=overdue")}>
                      {stats.overdue} overdue
                    </a>
                  </>
                )}
              </>
            ) : (
              "Loading your tasks…"
            )}
          </p>
        </div>
        <button className="btn primary" onClick={() => navigate("/tasks?new=1")}>
          <PlusIcon width={16} height={16} /> New task
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {noChannels && (
        <div className="alert warn">
          All notifications are off, so reminders won't reach you.{" "}
          <a href="/settings" onClick={goSettings}>
            Turn on email, Slack or push
          </a>
          .
        </div>
      )}

      <div className="stats">
        <StatTile label="Total tasks" value={stats?.total} to="/tasks" go={go} />
        <StatTile label="Open" value={stats ? open : undefined} tone="accent" to="/tasks?view=open" go={go} />
        <StatTile label="Due in 24h" value={stats?.due_soon} tone="warn" to="/tasks?view=due_soon" go={go} />
        <StatTile label="Overdue" value={stats?.overdue} tone="danger" to="/tasks?view=overdue" go={go} />
        <StatTile label="Completed" value={stats ? `${stats.completion_rate}%` : undefined} tone="ok" to="/tasks?view=completed" go={go} />
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Coming up</div>
          {upcoming.length === 0 ? (
            <p className="muted">
              Nothing due. Nice.{" "}
              <a href="/tasks?new=1" onClick={go("/tasks?new=1")}>
                Add a task
              </a>
            </p>
          ) : (
            <ul className="upcoming">
              {upcoming.map((t) => {
                const overdue = new Date(t.due_date!).getTime() < Date.now();
                return (
                  <li key={t.id}>
                    <a className="upcoming-link" href={`/tasks?task=${t.id}`} onClick={go(`/tasks?task=${t.id}`)} title={`Open “${t.title}”`}>
                      <span className={`dot p-${t.priority.toLowerCase()}`} />
                      <span className="grow">{t.title}</span>
                      <span className={overdue ? "danger-text" : "muted"} title={formatDate(t.due_date)}>
                        {relativeTime(t.due_date!)}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Notifications</div>
          <div className="channels">
            <a className={`chip chip-link ${user.email_notifications ? "on" : ""}`} href="/settings#email" onClick={go("/settings#email")}>
              <MailIcon /> Email {user.email_notifications ? "on" : "off"}
            </a>
            <a className={`chip chip-link ${slackOn ? "on" : ""}`} href="/settings#slack" onClick={go("/settings#slack")}>
              <SlackLogo size={15} /> Slack {user.slack_connected ? (user.slack_notifications ? "on" : "off") : "not connected"}
            </a>
            {pushDevices !== null && (
              <a className={`chip chip-link ${pushDevices > 0 ? "on" : ""}`} href="/settings#push" onClick={go("/settings#push")}>
                <BellIcon /> Push {pushDevices > 0 ? `on (${pushDevices} device${pushDevices === 1 ? "" : "s"})` : "off"}
              </a>
            )}
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

function StatTile({
  label,
  value,
  tone,
  to,
  go,
}: {
  label: string;
  value: number | string | undefined;
  tone?: string;
  to: string;
  go: (to: string) => (e: React.MouseEvent) => void;
}) {
  return (
    <a className={`stat stat-link ${tone ?? ""}`} href={to} onClick={go(to)} aria-label={`${label}: ${value ?? "loading"}. View tasks`}>
      <div className="stat-value">{value ?? "–"}</div>
      <div className="stat-label">
        {label} <span className="stat-arrow" aria-hidden="true">→</span>
      </div>
    </a>
  );
}
