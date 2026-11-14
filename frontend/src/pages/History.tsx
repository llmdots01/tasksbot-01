import { useCallback, useEffect, useState } from "react";
import { api, formatDate, relativeTime, type LogEntry } from "../api";
import { BellIcon, MailIcon, SlackLogo, TrashIcon } from "../icons";
import { toast } from "../toast";
import { onDataChanged } from "../events";

type Filter = "all" | "email" | "slack" | "push";
const FILTER_LABEL: Record<Filter, string> = { all: "All", email: "Email", slack: "Slack", push: "Push" };
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

  const removeEntry = async (entry: LogEntry) => {
    try {
      await api(`/api/notifications/log/${entry.id}`, { method: "DELETE" });
      setLog((l) => l?.filter((x) => x.id !== entry.id) ?? null);
      toast.success("Entry deleted");
    } catch (e) {
      toast.error("Couldn't delete the entry", { detail: (e as Error).message });
    }
  };

  const clearAll = async () => {
    const scope = filter === "all" ? "all notification history" : `all ${FILTER_LABEL[filter]} history`;
    if (!confirm(`Delete ${scope}? This can't be undone.`)) return;
    try {
      const { deleted } = await api<{ deleted: number }>(`/api/notifications/log${filter === "all" ? "" : `?channel=${filter}`}`, { method: "DELETE" });
      setLog([]);
      toast.success(deleted ? `Deleted ${deleted} entr${deleted === 1 ? "y" : "ies"}` : "Nothing to delete");
    } catch (e) {
      toast.error("Couldn't clear history", { detail: (e as Error).message });
    }
  };

  const sent = log?.filter((l) => l.success).length ?? 0;
  const failed = (log?.length ?? 0) - sent;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>History</h1>
          <p className="muted">Every reminder, due alert and test notification sent to you.</p>
        </div>
        <div className="btn-row">
          <button className="btn outline sm" onClick={load}>
            Refresh
          </button>
          <button className="btn outline sm danger-text" onClick={clearAll} disabled={!log?.length}>
            <TrashIcon width={14} height={14} /> {filter === "all" ? "Clear all" : `Clear ${FILTER_LABEL[filter]}`}
          </button>
        </div>
      </div>

      <div className="history-bar">
        <div className="segmented" role="tablist" aria-label="Channel">
          {(["all", "email", "slack", "push"] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "email" && <MailIcon width={15} height={15} />}
              {f === "slack" && <SlackLogo size={14} />}
              {f === "push" && <BellIcon width={15} height={15} />}
              {FILTER_LABEL[f]}
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
                <th aria-label="Actions" />
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
                      {l.channel === "email" ? <MailIcon width={15} height={15} /> : l.channel === "push" ? <BellIcon width={15} height={15} /> : <SlackLogo size={14} />}
                      {FILTER_LABEL[l.channel]}
                    </span>
                  </td>
                  <td>{KIND_LABEL[l.kind] ?? l.kind}</td>
                  <td>{l.task_title ?? (l.kind === "test" ? "—" : <span className="muted">(deleted)</span>)}</td>
                  <td className={l.success ? "ok-text" : "danger-text"} title={l.error ?? ""}>
                    {l.success ? "Sent" : `Failed${l.error ? `: ${l.error.slice(0, 80)}` : ""}`}
                  </td>
                  <td className="log-actions">
                    <button className="icon-btn sm-icon" aria-label="Delete this entry" title="Delete" onClick={() => removeEntry(l)}>
                      <TrashIcon width={15} height={15} />
                    </button>
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
