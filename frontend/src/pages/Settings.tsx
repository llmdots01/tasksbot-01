import { useEffect, useState } from "react";
import { api, type Providers, type User } from "../api";
import { AlertIcon, MailIcon, SlackLogo, TrashIcon } from "../icons";
import { navigate } from "../router";

export default function Settings({
  user,
  onUserChange,
  onAccountDeleted,
}: {
  user: User;
  onUserChange: (u: User) => void;
  onAccountDeleted: () => void;
}) {
  const [providers, setProviders] = useState<Providers | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("slack") === "connected") return { kind: "ok", text: "Slack connected. Reminders will now be posted there." };
    if (p.get("slack") === "error") return { kind: "error", text: p.get("message") ?? "Slack connection failed." };
    return null;
  });
  const [webhook, setWebhook] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (location.search) history.replaceState(null, "", "/settings");
    api<Providers>("/auth/providers").then(setProviders).catch(() => {});
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
    });

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
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Choose where your reminders are delivered.</p>
        </div>
      </div>
      {msg && <div className={`alert ${msg.kind === "ok" ? "success" : "error"}`}>{msg.text}</div>}

      <section className="card">
        <div className="setting">
          <div>
            <h2>
              <MailIcon /> Email notifications
            </h2>
            <p className="muted">
              Reminders and due alerts go to <strong>{user.email}</strong>.
            </p>
          </div>
          <Switch checked={user.email_notifications} disabled={busy === "email"} onChange={(v) => save({ email_notifications: v }, "email")} label="Email notifications" />
        </div>
        <button className="btn outline sm" disabled={busy === "test-email"} onClick={() => test("email")}>
          {busy === "test-email" ? "Sending…" : "Send test email"}
        </button>
      </section>

      <section className="card">
        <div className="setting">
          <div>
            <h2>
              <SlackLogo /> Slack notifications
            </h2>
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
            <button className="btn outline sm" disabled={busy === "test-slack"} onClick={() => test("slack")}>
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

      <p className="muted small">
        See every reminder and test that was sent in{" "}
        <a href="/history" onClick={(e) => (e.preventDefault(), navigate("/history"))}>
          History
        </a>
        .
      </p>

      <DeleteAccount email={user.email} onDeleted={onAccountDeleted} />
    </div>
  );
}

function DeleteAccount({ email, onDeleted }: { email: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = confirm.trim().toLowerCase() === email.toLowerCase();

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/me", { method: "DELETE", body: JSON.stringify({ confirm }) });
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className="card danger-zone">
      <div className="setting">
        <div>
          <h2>
            <AlertIcon /> Delete account
          </h2>
          <p className="muted">
            Permanently delete your account, all your tasks and your notification history. This can't be undone.
          </p>
        </div>
        {!open && (
          <button className="btn danger sm" onClick={() => setOpen(true)}>
            <TrashIcon width={15} height={15} /> Delete account
          </button>
        )}
      </div>
      {open && (
        <form
          className="stack sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (matches && !busy) remove();
          }}
        >
          {error && <div className="alert error">{error}</div>}
          <label>
            <span>
              Type <strong className="mono-email">{email}</strong> to confirm
            </span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus autoComplete="off" spellCheck={false} placeholder={email} />
          </label>
          <div className="btn-row">
            <button type="submit" className="btn danger sm" disabled={!matches || busy}>
              {busy ? "Deleting…" : "Permanently delete my account"}
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setOpen(false);
                setConfirm("");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
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
