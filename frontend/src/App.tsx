import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken, setUnauthorizedHandler, type User } from "./api";
import { navigate, usePath } from "./router";
import { ThemeButton } from "./theme";
import { GearIcon, GridIcon, ListIcon, LogOutIcon, UserIcon, Wordmark } from "./icons";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Settings from "./pages/Settings";
import { Footer, PrivacyPage, TermsPage } from "./pages/Legal";

const PUBLIC_PATHS = ["/privacy", "/terms"];

const NAV: { path: string; label: string; icon: ReactNode }[] = [
  { path: "/", label: "Dashboard", icon: <GridIcon /> },
  { path: "/tasks", label: "Tasks", icon: <ListIcon /> },
  { path: "/settings", label: "Settings", icon: <GearIcon /> },
];

// OAuth redirect lands on /auth/callback#token=... — capture it before the first render.
if (location.pathname === "/auth/callback") {
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  if (token) setToken(token);
  history.replaceState(null, "", "/");
}

export default function App() {
  const path = usePath();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<User>("/api/me"));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      navigate("/login", true);
    });
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (loading || PUBLIC_PATHS.includes(path)) return;
    if (!user && path !== "/login") navigate("/login", true);
    if (user && path === "/login") navigate("/", true);
  }, [user, loading, path]);

  // Legal pages are public and don't depend on sign-in state.
  if (path === "/privacy") return <PrivacyPage />;
  if (path === "/terms") return <TermsPage />;

  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Login />;

  const logout = () => {
    setToken(null);
    setUser(null);
    navigate("/login", true);
  };
  const go = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(to);
  };
  const slackOff = !user.slack_connected;

  return (
    <div className="layout">
      {slackOff && (
        <div className="announce">
          <span>
            <strong>New:</strong> get task reminders right in Slack.
          </span>
          <a href="/settings" onClick={go("/settings")}>
            Connect Slack →
          </a>
        </div>
      )}
      <header className="topbar">
        <a className="brand" href="/" onClick={go("/")} aria-label="Task(AI)Do home">
          <Wordmark />
        </a>
        <nav>
          {NAV.map((n) => (
            <a key={n.path} href={n.path} className={path === n.path ? "active" : ""} onClick={go(n.path)}>
              {n.icon}
              {n.label}
            </a>
          ))}
        </nav>
        <div className="topbar-right">
          <ThemeButton />
          <div className="user-chip" title={user.email}>
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="avatar" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar fallback">
                <UserIcon width={16} height={16} />
              </span>
            )}
            <span className="user-name">{user.name ?? user.email}</span>
          </div>
          <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out">
            <LogOutIcon />
          </button>
        </div>
      </header>
      <main className="content">
        {path === "/tasks" ? (
          <Tasks />
        ) : path === "/settings" ? (
          <Settings user={user} onUserChange={setUser} />
        ) : (
          <Dashboard user={user} />
        )}
      </main>
      <Footer />
    </div>
  );
}
