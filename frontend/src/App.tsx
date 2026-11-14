import { useCallback, useEffect, useState } from "react";
import { api, getToken, setToken, setUnauthorizedHandler, type User } from "./api";
import { navigate, usePath } from "./router";
import { ThemeButton } from "./theme";
import { Wordmark } from "./icons";
import { ProfileMenu } from "./ProfileMenu";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Settings from "./pages/Settings";
import History from "./pages/History";
import { Assistant } from "./Assistant";
import { emitDataChanged, onDataChanged } from "./events";
import { toast } from "./toast";
import { Footer, PrivacyPage, TermsPage } from "./pages/Legal";

const PUBLIC_PATHS = ["/privacy", "/terms"];

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

  // A push that arrives while the app is open is also shown as an in-app toast.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; title?: string; body?: string; url?: string } | null;
      if (d?.type !== "push") return;
      toast.info(d.title || "Task(AI)Do", {
        detail: d.body || undefined,
        duration: 8000,
        action: d.url ? { label: "View", onClick: () => navigate(d.url!) } : undefined,
      });
      emitDataChanged();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  // Refresh the user (notification settings) when the assistant changes something.
  useEffect(() => onDataChanged(() => api<User>("/api/me").then(setUser).catch(() => {})), []);

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

  return (
    <div className="layout">
      <header className="topbar">
        <a className="brand" href="/" onClick={go("/")} aria-label="Task(AI)Do home">
          <Wordmark />
        </a>
        <div className="topbar-right">
          <ThemeButton />
          <ProfileMenu user={user} path={path} onLogout={logout} />
        </div>
      </header>
      <main className="content">
        {path === "/tasks" ? (
          <Tasks />
        ) : path === "/history" ? (
          <History />
        ) : path === "/settings" ? (
          <Settings user={user} onUserChange={setUser} onAccountDeleted={logout} />
        ) : (
          <Dashboard user={user} />
        )}
      </main>
      <Footer />
      <Assistant />
    </div>
  );
}
