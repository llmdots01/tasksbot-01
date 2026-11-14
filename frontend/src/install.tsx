import { useEffect, useState } from "react";
import { PhoneIcon, PlusSquareIcon, ShareIcon, Wordmark } from "./icons";

/** Chrome/Edge/Samsung Internet fire this when the app can be installed. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

// Registered at import time (from main.tsx) so the event isn't missed before React mounts.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  notify();
});
window.addEventListener("appinstalled", () => {
  deferred = null;
  justInstalled = true;
  notify();
});

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isMobile(): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("Service worker registration failed", e));
  });
}

/**
 * Install state for the current browser.
 * - `available`: show an install entry point (one-tap prompt, iOS instructions, or generic instructions on mobile).
 */
export function useInstall() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const installed = justInstalled || isStandalone();
  const canPrompt = Boolean(deferred);
  const ios = isIOS();
  return {
    installed,
    available: !installed && (canPrompt || ios || isMobile()),
    canPrompt,
    ios,
    /** Show the native prompt if possible; returns false if the caller should show instructions instead. */
    async prompt(): Promise<boolean> {
      if (!deferred) return false;
      const ev = deferred;
      deferred = null;
      await ev.prompt();
      await ev.userChoice.catch(() => undefined);
      notify();
      return true;
    },
  };
}

/** Step-by-step instructions for browsers without a one-tap install prompt (iPhone Safari, Firefox, etc.). */
export function InstallInstructions({ ios, onClose }: { ios: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card install-sheet" role="dialog" aria-modal="true" aria-labelledby="install-title">
        <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <img src="/icons/icon-192.png" alt="" width={64} height={64} className="install-icon" />
        <h2 id="install-title">
          Install <Wordmark />
        </h2>
        <p className="muted">Add it to your home screen to open it full-screen, like an app.</p>
        {ios ? (
          <ol className="install-steps">
            <li>
              <span className="step-icon">
                <ShareIcon />
              </span>
              <span>
                Tap <strong>Share</strong> in Safari's toolbar
              </span>
            </li>
            <li>
              <span className="step-icon">
                <PlusSquareIcon />
              </span>
              <span>
                Choose <strong>Add to Home Screen</strong>
              </span>
            </li>
            <li>
              <span className="step-icon">
                <PhoneIcon />
              </span>
              <span>
                Tap <strong>Add</strong>, then open Task(AI)Do from your home screen
              </span>
            </li>
          </ol>
        ) : (
          <ol className="install-steps">
            <li>
              <span className="step-icon">⋮</span>
              <span>
                Open your browser's <strong>menu</strong>
              </span>
            </li>
            <li>
              <span className="step-icon">
                <PlusSquareIcon />
              </span>
              <span>
                Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>
              </span>
            </li>
          </ol>
        )}
        {ios && <p className="muted small">On iPhone and iPad this works from Safari.</p>}
        <button className="btn primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

/** "Get the app" button: native prompt where supported, instructions otherwise. Renders nothing once installed. */
export function InstallButton({ compact = false }: { compact?: boolean }) {
  const install = useInstall();
  const [showHelp, setShowHelp] = useState(false);
  if (!install.available) return null;

  const onClick = async () => {
    if (!(await install.prompt())) setShowHelp(true);
  };
  return (
    <>
      <button className={`btn outline sm install-btn ${compact ? "compact" : ""}`} onClick={onClick} aria-label="Install the app">
        <PhoneIcon width={16} height={16} />
        <span className="install-label">Get the app</span>
      </button>
      {showHelp && <InstallInstructions ios={install.ios} onClose={() => setShowHelp(false)} />}
    </>
  );
}
