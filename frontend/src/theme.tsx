import { useEffect, useRef, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

export type Mode = "dark" | "light";
export type Accent = "green" | "orange" | "coral" | "blue" | "purple";

export const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "green", label: "Green", color: "#22c55e" },
  { id: "orange", label: "Orange", color: "#f5a83c" },
  { id: "coral", label: "Coral", color: "#ec7a5c" },
  { id: "blue", label: "Blue", color: "#4f8ff7" },
  { id: "purple", label: "Purple", color: "#a78bfa" },
];

const MODE_KEY = "taskaido_mode";
const ACCENT_KEY = "taskaido_accent";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function getMode(): Mode {
  return read<Mode>(MODE_KEY, ["dark", "light"], "dark");
}
export function getAccent(): Accent {
  return read<Accent>(ACCENT_KEY, ACCENTS.map((a) => a.id), "green");
}

export function applyTheme(mode = getMode(), accent = getAccent()) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.dataset.accent = accent;
}

/** Moon/sun button: click opens the accent picker, double-click toggles dark/light. */
export function ThemeButton() {
  const [mode, setMode] = useState<Mode>(getMode);
  const [accent, setAccent] = useState<Accent>(getAccent);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    applyTheme(mode, accent);
    write(MODE_KEY, mode);
    write(ACCENT_KEY, accent);
  }, [mode, accent]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Delay the single-click action slightly so a double-click doesn't also flash the popover.
  const onClick = () => {
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => setOpen((o) => !o), 220);
  };
  const onDoubleClick = () => {
    window.clearTimeout(clickTimer.current);
    setMode((m) => (m === "dark" ? "light" : "dark"));
  };

  return (
    <div className="theme-wrap" ref={wrap}>
      <button
        type="button"
        className={`icon-btn ${open ? "active" : ""}`}
        aria-label={`Theme options (currently ${mode}). Double-click to switch to ${mode === "dark" ? "light" : "dark"}.`}
        aria-expanded={open}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {mode === "dark" ? <MoonIcon /> : <SunIcon />}
      </button>
      {open && (
        <div className="theme-pop" role="dialog" aria-label="Theme">
          <div className="eyebrow">Accent colour</div>
          <div className="swatches">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`swatch ${accent === a.id ? "selected" : ""}`}
                style={{ ["--sw" as string]: a.color }}
                aria-label={a.label}
                aria-pressed={accent === a.id}
                onClick={() => setAccent(a.id)}
              />
            ))}
          </div>
          <div className="pop-divider" />
          <p className="pop-hint">Double-click the icon to switch between dark and light.</p>
          <button type="button" className="pop-mode" onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}>
            {mode === "dark" ? <SunIcon /> : <MoonIcon />} Switch to {mode === "dark" ? "light" : "dark"}
          </button>
        </div>
      )}
    </div>
  );
}
