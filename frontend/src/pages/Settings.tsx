import { useEffect, useState } from "react";
import { api, formatDate, type LogEntry, type Providers, type User } from "../api";

export default function Settings({ user, onUserChange }: { user: User; onUserChange: (u: User) => void }) {
  const [providers, setProviders] = useState<Providers | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("slack") === "connected") return { kind: "ok", text: "Slack connected. Reminders will now be posted there." };
    if (p.get("slack") === "error") return { kind: "error", text: p.get("message") ?? "Slack connection failed." };
    return null;
  });
  const [webhook, setWebhook] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const loadLog = () => api<LogEntry[]>("/api/notifications/log").then(setLog).catch(() => {});

  useEffect(() => {
    if (location.search) history.replaceState(null, "", "/settings");
    api<Providers>("/auth/providers").then(setProviders).catch(() => {});
    loadLog();
    // Refresh user after a Slack redirect.
    api<User>("/api/me").then(onUserChange).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const save = (body: Record<string, unknown>, key: string) =>
    run(key, async () => {
      onUserChange(await api<User>("/api/settings", { method: "PUT", body: JSON.stringify(body) }));
    });

  const test = (channel: "email" | "slack") =>
    run(`test-${channel}`, async () => {
      await api("/api/notifications/test", { method: "POST", body: JSON.stringify({ channel }) });
      setMsg({ kind: "ok", text: `Test ${channel} sent${channel === "email" ? ` to ${user.email}` : ""}.` });
    }).finally(loadLog);

  const addToSlack = () =>
    run("slack-oauth", async () => {
      const { url } = await api<{ url: string }>("/api/slack/ticket", { method: "POST" });
      location.href = url;
    });

  const disconnect = () =>
    run("disconnect", async () => {
      onUserChange(await api<User>("/api/slack", { method: "DELETE" }));
    });

  return (
    <div className="stack">
      <h1>Settings</h1>
      {msg && <div className={`alert ${msg.kind === "ok" ? "success" : "error"}`}>{msg.text}</div>}

      <section className="card">
        <div className="setting">
          <div>
            <h2>Email notifications</h2>
            <p className="muted">
              Reminders and due alerts go to <strong>{user.email}</strong>.
            </p>
          </div>
          <Switch checked={user.email_notifications} disabled={busy === "email"} onChange={(v) => save({ email_notifications: v }, "email")} label="Email notifications" />
        </div>
        <button className="btn ghost sm" disabled={busy === "test-email"} onClick={() => test("email")}>
          {busy === "test-email" ? "Sending…" : "Send test email"}
        </button>
      </section>

      <section className="card">
        <div className="setting">
          <div>
            <h2>Slack notifications</h2>
            <p className="muted">
              {user.slack_connected
                ? `Connected${user.slack_channel ? ` to ${user.slack_channel}` : " via webhook"}.`
                : "Post reminders to a Slack channel or DM."}
            </p>
          </div>
          <Switch
            checked={user.slack_notifications && user.slack_connected}
            disabled={!user.slack_connected || busy === "slack"}
            onChange={(v) => save({ slack_notifications: v }, "slack")}
            label="Slack notifications"
          />
        </div>

        {user.slack_connected ? (
          <div className="btn-row">
            <button className="btn ghost sm" disabled={busy === "test-slack"} onClick={() => test("slack")}>
              {busy === "test-slack" ? "Sending…" : "Send test message"}
            </button>
            <button className="btn ghost sm danger-text" disabled={busy === "disconnect"} onClick={disconnect}>
              Disconnect Slack
            </button>
          </div>
        ) : (
          <div className="stack sm">
            {providers?.slack && (
              <button className="btn slack" onClick={addToSlack} disabled={busy === "slack-oauth"}>
                <svg width="18" height="18" viewBox="0 0 122.8 122.8" aria-hidden="true">
                  <path d="M25.8 77.6a12.9 12.9 0 1 1-12.9-12.9h12.9v12.9zm6.5 0a12.9 12.9 0 1 1 25.8 0v32.3a12.9 12.9 0 1 1-25.8 0V77.6z" fill="#e01e5a" />
                  <path d="M45.2 25.8a12.9 12.9 0 1 1 12.9-12.9v12.9H45.2zm0 6.5a12.9 12.9 0 1 1 0 25.8H12.9a12.9 12.9 0 1 1 0-25.8h32.3z" fill="#36c5f0" />
                  <path d="M97 45.2a12.9 12.9 0 1 1 12.9 12.9H97V45.2zm-6.5 0a12.9 12.9 0 1 1-25.8 0V12.9a12.9 12.9 0 1 1 25.8 0v32.3z" fill="#2eb67d" />
                  <path d="M77.6 97a12.9 12.9 0 1 1-12.9 12.9V97h12.9zm0-6.5a12.9 12.9 0 1 1 0-25.8h32.3a12.9 12.9 0 1 1 0 25.8H77.6z" fill="#ecb22e" />
                </svg>
                Add to Slack
              </button>
            )}
            <form
              className="webhook-form"
              onSubmit={(e) => {
                e.preventDefault();
                save({ slack_webhook_url: webhook }, "webhook").then(() => setWebhook(""));
              }}
            >
              <label>
                {providers?.slack ? "…or paste an incoming webhook URL" : "Incoming webhook URL"}
                <input
                  type="url"
                  placeholder="https://hooks.slack.com/services/T000/B000/XXXX"
                  value={webhook}
                  onChange={(e) => setWebhook(e.target.value)}
                />
              </label>
              <button className="btn primary sm" disabled={!webhook || busy === "webhook"}>
                Connect
              </button>
            </form>
            <p className="muted small">
              Create one at api.slack.com/apps → your app → Incoming Webhooks → Add New Webhook to Workspace.
            </p>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Recent deliveries</h2>
        {log.length === 0 ? (
          <p className="muted">No notifications sent yet.</p>
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
                  <td>{formatDate(l.created_at)}</td>
                  <td>{l.channel}</td>
                  <td>{l.kind}</td>
                  <td>{l.task_title ?? (l.kind === "test" ? "—" : "(deleted)")}</td>
                  <td className={l.success ? "ok-text" : "danger-text"} title={l.error ?? ""}>
                    {l.success ? "Sent" : `Failed${l.error ? `: ${l.error.slice(0, 60)}` : ""}`}
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

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
