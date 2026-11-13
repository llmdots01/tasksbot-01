import { useCallback, useEffect, useState } from "react";
import { api, getToken, setToken, setUnauthorizedHandler, type User } from "./api";
import { navigate, usePath } from "./router";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Settings from "./pages/Settings";

const NAV = [
  { path: "/", label: "Dashboard" },
  { path: "/tasks", label: "Tasks" },
  { path: "/settings", label: "Settings" },
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
    if (loading) return;
    if (!user && path !== "/login") navigate("/login", true);
    if (user && path === "/login") navigate("/", true);
  }, [user, loading, path]);

  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Login />;

  const logout = () => {
    setToken(null);
    setUser(null);
    navigate("/login", true);
  };

  return (
    <div className="layout">
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => (e.preventDefault(), navigate("/"))}>
          <img src="/favicon.svg" alt="" width={24} height={24} /> TasksBot
        </a>
        <nav>
          {NAV.map((n) => (
            <a
              key={n.path}
              href={n.path}
              className={path === n.path ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                navigate(n.path);
              }}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="user">
          {user.avatar_url && <img src={user.avatar_url} alt="" className="avatar" referrerPolicy="no-referrer" />}
          <span className="user-name">{user.name ?? user.email}</span>
          <button className="btn ghost sm" onClick={logout}>
            Sign out
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
    </div>
  );
}
