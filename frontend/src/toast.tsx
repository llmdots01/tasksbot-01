import { useEffect, useState } from "react";

export type ToastKind = "success" | "error" | "info";
export interface ToastOptions {
  /** Second line under the message. */
  detail?: string;
  /** Optional button, e.g. Undo or View. */
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss after this many ms (default 4500; errors 7000). 0 keeps it until closed. */
  duration?: number;
}
interface Toast extends ToastOptions {
  id: number;
  kind: ToastKind;
  message: string;
  leaving?: boolean;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<(t: Toast[]) => void>();
const emit = () => listeners.forEach((fn) => fn(toasts));
const MAX_VISIBLE = 4;

function dismiss(id: number) {
  // Play the exit animation, then remove.
  toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 180);
}

function show(kind: ToastKind, message: string, opts: ToastOptions = {}): number {
  const id = nextId++;
  toasts = [...toasts, { id, kind, message, ...opts }].slice(-MAX_VISIBLE);
  emit();
  const duration = opts.duration ?? (kind === "error" ? 7000 : 4500);
  if (duration > 0) setTimeout(() => dismiss(id), duration);
  return id;
}

/** Small pop-up messages that work the same on phone and desktop. */
export const toast = {
  success: (message: string, opts?: ToastOptions) => show("success", message, opts),
  error: (message: string, opts?: ToastOptions) => show("error", message, opts),
  info: (message: string, opts?: ToastOptions) => show("info", message, opts),
  dismiss,
};

const ICON: Record<ToastKind, string> = { success: "✓", error: "!", info: "🔔" };

export function Toaster() {
  const [items, setItems] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  return (
    <div className="toaster" aria-live="polite" aria-relevant="additions">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind} ${t.leaving ? "leaving" : ""}`} role={t.kind === "error" ? "alert" : "status"}>
          <span className="toast-icon" aria-hidden="true">
            {ICON[t.kind]}
          </span>
          <div className="toast-body">
            <div className="toast-msg">{t.message}</div>
            {t.detail && <div className="toast-detail">{t.detail}</div>}
          </div>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
