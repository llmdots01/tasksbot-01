import { useEffect, useState } from "react";
import { api, API_URL, type Providers } from "../api";
import { navigate } from "../router";
import { ThemeButton } from "../theme";
import {
  ArrowRightIcon,
  BellIcon,
  ClockIcon,
  GithubLogo,
  GoogleLogo,
  MailIcon,
  ShieldIcon,
  SlackLogo,
  SparkIcon,
  Wordmark,
} from "../icons";
import { Footer } from "./Legal";

const FEATURES = [
  { icon: <BellIcon />, title: "Reminders you choose", text: "Pick an exact time or a preset (15 min, 1 hour or 1 day before), plus an alert when the task is due." },
  { icon: <MailIcon />, title: "Email, your way", text: "Clean reminder emails delivered by Resend. Switch them on or off any time from Settings." },
  { icon: <SlackLogo size={20} />, title: "Slack notifications", text: "Add Task(AI)Do to Slack in one click and pick the channel or DM where reminders should land." },
  { icon: <ClockIcon />, title: "Never double-pinged", text: "Each reminder is sent exactly once, even if you edit the task. Completed tasks stay quiet." },
  { icon: <SparkIcon />, title: "Priorities & tags", text: "Low to Critical priorities, categories and tags, plus search and filters to find anything fast." },
  { icon: <ShieldIcon />, title: "Sign in securely", text: "Use your Google or GitHub account. No new password to remember, and your tasks stay private to you." },
];

export default function Login() {
  const [providers, setProviders] = useState<Providers | null>(null);
  const [error] = useState(() => new URLSearchParams(location.hash.slice(1)).get("error"));

  useEffect(() => {
    api<Providers>("/auth/providers")
      .then(setProviders)
      // If the check fails, keep the buttons usable rather than wrongly disabling them.
      .catch(() => {});
  }, []);

  // Open the sign-in dialog straight away if we came back from a failed sign-in.
  const [signinOpen, setSigninOpen] = useState(() => Boolean(error));

  useEffect(() => {
    if (!signinOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSigninOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signinOpen]);

  return (
    <div className="landing">
      <header className="topbar">
        <span className="brand">
          <Wordmark />
        </span>
        <nav />
        <div className="topbar-right">
          <ThemeButton />
          <button className="btn primary sm" onClick={() => setSigninOpen(true)} aria-haspopup="dialog">
            Login <ArrowRightIcon width={15} height={15} />
          </button>
        </div>
      </header>

      <section className="hero">
        <h1>
          Never Miss <span className="grad-text grad-underline">Another Task</span>
          <br />
          Again
        </h1>
        <p className="lede">
          The simplest way to stay on top of your work, with <span className="u-link">smart reminders</span> sent straight to your{" "}
          <span className="u-link">email and Slack</span>.
        </p>
      </section>

      <section className="features-wrap" id="features">
        <div className="panel">
          <h2>Everything You Need</h2>
          <p className="muted">A focused task list with reminders that reach you on the channels you already use.</p>
          <div className="features">
            {FEATURES.map((f) => (
              <div className="feature" key={f.title}>
                <div className="f-icon">{f.icon}</div>
                <h4>{f.title}</h4>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {signinOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSigninOpen(false)}>
          <div className="modal card signin-dialog" role="dialog" aria-modal="true" aria-labelledby="signin-title">
            <button type="button" className="dialog-close" aria-label="Close" onClick={() => setSigninOpen(false)}>
              ×
            </button>
            <h2 id="signin-title">
              Sign in to <Wordmark />
            </h2>
            <p className="muted">Use your Google or GitHub account. No new password needed.</p>
            {error && <div className="alert error">{error}</div>}
            <a className={`btn oauth ${providers?.google === false ? "disabled" : ""}`} href={`${API_URL}/auth/google/login`} autoFocus>
              <GoogleLogo /> Continue with Google
            </a>
            <a className={`btn oauth ${providers?.github === false ? "disabled" : ""}`} href={`${API_URL}/auth/github/login`}>
              <GithubLogo /> Continue with GitHub
            </a>
            <p className="muted small signin-legal">
              By continuing you agree to our{" "}
              <a href="/terms" onClick={(e) => (e.preventDefault(), navigate("/terms"))}>Terms of Service</a> and{" "}
              <a href="/privacy" onClick={(e) => (e.preventDefault(), navigate("/privacy"))}>Privacy Policy</a>.
            </p>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
