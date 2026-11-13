import { useEffect, useState } from "react";
import { api, API_URL, type Providers } from "../api";
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
      .catch(() => setProviders({ google: false, github: false, slack: false }));
  }, []);

  const none = providers && !providers.google && !providers.github;
  const scrollToSignIn = () => document.getElementById("signin")?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="landing">
      <div className="announce">
        <span>
          <strong>New:</strong> Slack and email reminders for every task.
        </span>
        <a href="#signin" onClick={(e) => (e.preventDefault(), scrollToSignIn())}>
          Get started free
        </a>
      </div>
      <header className="topbar">
        <span className="brand">
          <Wordmark />
        </span>
        <nav />
        <div className="topbar-right">
          <ThemeButton />
          <button className="btn primary sm" onClick={scrollToSignIn}>
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

        <div className="social-proof">
          <div className="dots" aria-hidden="true">
            <span><MailIcon /></span>
            <span><SlackLogo size={15} /></span>
            <span><BellIcon /></span>
            <span><ClockIcon /></span>
          </div>
          <span>
            Reminders delivered <strong style={{ color: "var(--text)" }}>on time, every time</strong>
          </span>
        </div>

        <div className="hero-cta">
          <button className="btn navy pill" onClick={scrollToSignIn}>
            Start Free <ArrowRightIcon width={16} height={16} />
          </button>
          <a className="btn primary pill" href="#features" onClick={(e) => (e.preventDefault(), document.getElementById("features")?.scrollIntoView({ behavior: "smooth" }))}>
            <SparkIcon width={16} height={16} /> See Features
          </a>
        </div>

        <div className="signin-box" id="signin">
          {error && <div className="alert error">{error}</div>}
          <a className={`btn oauth ${providers?.google === false ? "disabled" : ""}`} href={`${API_URL}/auth/google/login`}>
            <GoogleLogo /> Continue with Google
          </a>
          <a className={`btn oauth ${providers?.github === false ? "disabled" : ""}`} href={`${API_URL}/auth/github/login`}>
            <GithubLogo /> Continue with GitHub
          </a>
          {none && <p className="muted small">Sign-in isn't configured on the server yet. See the README.</p>}
        </div>
      </section>

      <section className="channels-strip">
        <h3>Reminders wherever you work</h3>
        <div className="channel-logos">
          <div><MailIcon /> Email</div>
          <div><SlackLogo size={30} /> Slack</div>
          <div><GoogleLogo /> Google</div>
          <div><GithubLogo /> GitHub</div>
        </div>
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
    </div>
  );
}
