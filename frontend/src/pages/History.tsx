import { useCallback, useEffect, useState } from "react";
import { api, formatDate, relativeTime, type LogEntry } from "../api";
import { MailIcon, SlackLogo } from "../icons";
import { onDataChanged } from "../events";

type Filter = "all" | "email" | "slack";
const KIND_LABEL: Record<LogEntry["kind"], string> = { reminder: "Reminder", due: "Due alert", test: "Test" };

export default function History() {
  const [filter, setFilter] = useState<Filter>("all");
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLog(await api<LogEntry[]>(`/api/notifications/log?limit=100${filter === "all" ? "" : `&channel=${filter}`}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => onDataChanged(load), [load]);

  const sent = log?.filter((l) => l.success).length ?? 0;
  const failed = (log?.length ?? 0) - sent;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>History</h1>
          <p className="muted">Every reminder, due alert and test notification sent to you.</p>
        </div>
        <button className="btn outline sm" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="history-bar">
        <div className="segmented" role="tablist" aria-label="Channel">
          {(["all", "email", "slack"] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "email" && <MailIcon width={15} height={15} />}
              {f === "slack" && <SlackLogo size={14} />}
              {f === "all" ? "All" : f === "email" ? "Email" : "Slack"}
            </button>
          ))}
        </div>
        {log && log.length > 0 && (
          <span className="muted small">
            {sent} sent{failed ? ` · ${failed} failed` : ""}
          </span>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="card">
        {log === null ? (
          <p className="muted">Loading…</p>
        ) : log.length === 0 ? (
          <p className="muted">No notifications {filter === "all" ? "" : `on ${filter} `}yet.</p>
        ) : (
          <table className="log">
            <thead>
              <tr>
                <th>When</th>
                <th>Channel</th>
                <th>Type</th>
                <th>Task</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <td title={formatDate(l.created_at)}>
                    {formatDate(l.created_at)}
                    <div className="muted small">{relativeTime(l.created_at)}</div>
                  </td>
                  <td>
                    <span className="log-channel">
                      {l.channel === "email" ? <MailIcon width={15} height={15} /> : <SlackLogo size={14} />}
                      {l.channel === "email" ? "Email" : "Slack"}
                    </span>
                  </td>
                  <td>{KIND_LABEL[l.kind] ?? l.kind}</td>
                  <td>{l.task_title ?? (l.kind === "test" ? "—" : <span className="muted">(deleted)</span>)}</td>
                  <td className={l.success ? "ok-text" : "danger-text"} title={l.error ?? ""}>
                    {l.success ? "Sent" : `Failed${l.error ? `: ${l.error.slice(0, 80)}` : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
