import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { emitDataChanged } from "./events";
import { SparkIcon } from "./icons";

type Provider = "auto" | "gemini" | "llama";
interface Action {
  tool: string;
  label: string;
}
interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: Action[];
  provider?: string;
  fallback?: boolean;
  error?: boolean;
}
interface ChatResponse {
  reply: string;
  actions: Action[];
  provider: "gemini" | "llama";
  model: string;
  fallback?: boolean;
}

const PROVIDER_KEY = "taskaido_ai_provider";
const SUGGESTIONS = [
  "Remind me to call mom tomorrow at 6pm",
  "What's due this week?",
  "Mark my overdue tasks as done",
  "Turn on Slack notifications",
];
const PROVIDER_LABEL: Record<string, string> = { gemini: "Gemini", llama: "Llama" };

function readProvider(): Provider {
  try {
    const v = localStorage.getItem(PROVIDER_KEY);
    return v === "gemini" || v === "llama" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Render the small subset of Markdown the model uses (bold and "- " bullets) without innerHTML. */
function formatInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}
function Formatted({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul${blocks.length}`}>
          {bullets.map((b, i) => (
            <li key={i}>{formatInline(b)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*[-*•]\s+(.*)/);
    if (m) bullets.push(m[1]);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{formatInline(line)}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

export function Assistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<Provider>(readProvider);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PROVIDER_KEY, provider);
    } catch {
      /* ignore */
    }
  }, [provider]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const history = next.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
      const res = await api<ChatResponse>("/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ messages: history, provider, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      setMsgs((m) => [...m, { role: "assistant", content: res.reply, actions: res.actions, provider: res.provider, fallback: res.fallback }]);
      if (res.actions?.length) emitDataChanged();
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      {!open && (
        <button className="ai-fab" onClick={() => setOpen(true)} aria-label="Open AI assistant">
          <SparkIcon width={18} height={18} />
          <span>Ask AI</span>
        </button>
      )}
      {open && (
        <section className="ai-panel" role="dialog" aria-label="AI assistant">
          <header className="ai-head">
            <div className="ai-title">
              <span className="ai-badge">
                <SparkIcon width={16} height={16} />
              </span>
              <div>
                <strong>Task(AI)Do assistant</strong>
                <span className="muted small">Creates and updates tasks for you</span>
              </div>
            </div>
            <div className="ai-head-actions">
              <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} aria-label="AI model" title="AI model">
                <option value="auto">Auto</option>
                <option value="gemini">Gemini</option>
                <option value="llama">Llama (free)</option>
              </select>
              {msgs.length > 0 && (
                <button className="btn ghost sm" onClick={() => setMsgs([])} disabled={busy} title="Start a new conversation">
                  New
                </button>
              )}
              <button className="dialog-close" aria-label="Close assistant" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
          </header>

          <div className="ai-messages" ref={listRef} aria-live="polite">
            {msgs.length === 0 && (
              <div className="ai-empty">
                <p>
                  Hi! Tell me what to do in plain words. I can add, change, complete and delete tasks, and manage your email and Slack
                  notifications.
                </p>
                <div className="ai-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="ai-chip" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role} ${m.error ? "error" : ""}`}>
                <div className="ai-bubble">{m.role === "assistant" ? <Formatted text={m.content} /> : m.content}</div>
                {m.actions && m.actions.length > 0 && (
                  <div className="ai-actions">
                    {m.actions.map((a, j) => (
                      <span key={j} className="ai-action">
                        ✓ {a.label}
                      </span>
                    ))}
                  </div>
                )}
                {m.provider && (
                  <span className="ai-meta">
                    {PROVIDER_LABEL[m.provider] ?? m.provider}
                    {m.fallback ? " (fallback)" : ""}
                  </span>
                )}
              </div>
            ))}
            {busy && (
              <div className="ai-msg assistant">
                <div className="ai-bubble ai-typing" aria-label="Thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          <form
            className="ai-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={2000}
              placeholder="Ask me to add or change a task…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <button type="submit" className="btn primary" disabled={!input.trim() || busy} aria-label="Send">
              Send
            </button>
          </form>
        </section>
      )}
    </>
  );
}
