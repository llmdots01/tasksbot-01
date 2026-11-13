import { useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "./api";
import { navigate } from "./router";
import { ChevronDownIcon, GearIcon, GridIcon, ListIcon, LogOutIcon, UserIcon } from "./icons";

const ITEMS: { path: string; label: string; icon: ReactNode }[] = [
  { path: "/", label: "Dashboard", icon: <GridIcon /> },
  { path: "/tasks", label: "Tasks", icon: <ListIcon /> },
  { path: "/settings", label: "Settings", icon: <GearIcon /> },
];

function Avatar({ user, size = 30 }: { user: User; size?: number }) {
  return user.avatar_url ? (
    <img src={user.avatar_url} alt="" className="avatar" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar fallback" style={{ width: size, height: size }}>
      <UserIcon width={size * 0.55} height={size * 0.55} />
    </span>
  );
}

/** Avatar button that opens a menu with the app's pages and sign out. */
export function ProfileMenu({ user, path, onLogout }: { user: User; path: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close whenever the page changes.
  useEffect(() => setOpen(false), [path]);

  const go = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    navigate(to);
  };
  const current = ITEMS.find((i) => i.path === path);

  return (
    <div className="profile-wrap" ref={wrap}>
      <button
        ref={button}
        type="button"
        className={`profile-btn ${open ? "active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar user={user} />
        <span className="profile-text">
          <span className="user-name">{user.name ?? user.email}</span>
          {current && <span className="profile-page">{current.label}</span>}
        </span>
        <ChevronDownIcon width={16} height={16} className="chev" />
      </button>

      {open && (
        <div className="profile-menu" role="menu" aria-label="Account">
          <div className="profile-head">
            <Avatar user={user} size={38} />
            <div className="profile-id">
              <strong>{user.name ?? "Your account"}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <div className="pop-divider" />
          {ITEMS.map((item) => (
            <a
              key={item.path}
              href={item.path}
              role="menuitem"
              className={`menu-item ${path === item.path ? "current" : ""}`}
              aria-current={path === item.path ? "page" : undefined}
              onClick={go(item.path)}
            >
              {item.icon}
              {item.label}
            </a>
          ))}
          <div className="pop-divider" />
          <button type="button" role="menuitem" className="menu-item" onClick={onLogout}>
            <LogOutIcon />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
