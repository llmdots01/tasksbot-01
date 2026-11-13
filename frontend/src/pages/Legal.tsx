import type { ReactNode } from "react";
import { navigate } from "../router";
import { ThemeButton } from "../theme";
import { Wordmark } from "../icons";

/** Where users send privacy and account requests. Swap for an email address if you prefer. */
export const CONTACT_URL = "https://github.com/llmdots01/tasksbot-01/issues";
export const CONTACT_LABEL = "our GitHub issue tracker";
const EFFECTIVE = "14 November 2026";
const SITE = "https://aitask.pareops.in";

const go = (to: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  navigate(to);
};

/** Footer with legal links, shown on every page. */
export function Footer() {
  return (
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} Task(AI)Do</span>
      <nav>
        <a href="/privacy" onClick={go("/privacy")}>
          Privacy Policy
        </a>
        <a href="/terms" onClick={go("/terms")}>
          Terms of Service
        </a>
      </nav>
    </footer>
  );
}

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="landing">
      <header className="topbar">
        <a className="brand" href="/" onClick={go("/")} aria-label="Task(AI)Do home">
          <Wordmark />
        </a>
        <nav />
        <div className="topbar-right">
          <ThemeButton />
          <a className="btn primary sm" href="/" onClick={go("/")}>
            Open app
          </a>
        </div>
      </header>
      <main className="legal">
        <div className="eyebrow">Effective {EFFECTIVE}</div>
        <h1>{title}</h1>
        {children}
      </main>
      <Footer />
    </div>
  );
}

const Contact = () => (
  <a href={CONTACT_URL} target="_blank" rel="noreferrer">
    {CONTACT_LABEL}
  </a>
);

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p className="legal-lede">
        Task(AI)Do ("we", "the app") is a task list that sends you reminders by email and Slack. This policy explains what we collect when
        you use <a href={SITE}>{SITE.replace("https://", "")}</a>, why, and the choices you have.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details from Google or GitHub.</strong> When you sign in, we receive your name, email address and profile picture,
          plus an account ID from that provider. We ask only for basic profile and email access. We never see your Google or GitHub password,
          and we don't keep the access token the provider gives us after sign-in.
        </li>
        <li>
          <strong>Tasks you create.</strong> Titles, descriptions, due dates, priorities, status, categories, tags and reminder times.
        </li>
        <li>
          <strong>Notification settings.</strong> Whether email and Slack notifications are on. If you connect Slack, we store the incoming
          webhook URL Slack gives us and the channel name.
        </li>
        <li>
          <strong>Delivery records.</strong> For each reminder we send, a record of when it was sent, on which channel, and whether it
          succeeded (including the error message if it failed). You can see these in Settings.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To sign you in and keep your tasks private to your account.</li>
        <li>To send the reminders and due-date alerts you set up, on the channels you turn on.</li>
        <li>To show your dashboard, task list and delivery history.</li>
      </ul>
      <p>We don't sell your data, use it for advertising, or share it with anyone except the service providers below.</p>

      <h2>Service providers</h2>
      <ul>
        <li>
          <strong>Cloudflare</strong> hosts the app and its database.
        </li>
        <li>
          <strong>Resend</strong> delivers reminder emails. It receives your email address and the task details in the message.
        </li>
        <li>
          <strong>Slack</strong> receives reminder messages if you connect it. They are posted to the channel you chose.
        </li>
        <li>
          <strong>Google and GitHub</strong> handle sign-in, under their own privacy policies.
        </li>
      </ul>

      <h2>Cookies and local storage</h2>
      <p>
        We don't use tracking or advertising cookies. Your browser stores your sign-in session and your theme choice (dark or light mode and
        accent colour) in local storage on your device. During sign-in we set a short-lived cookie, which expires within 10 minutes, to
        protect against forged requests.
      </p>

      <h2>How long we keep data</h2>
      <p>
        We keep your account, tasks and settings until you delete them or delete your account. Deleting a task removes it right
        away. Disconnecting Slack removes the stored webhook URL. Sign-in sessions expire after 30 days.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Turn email or Slack notifications on or off at any time in Settings.</li>
        <li>Edit or delete any task.</li>
        <li>Disconnect Slack from Settings.</li>
        <li>
          Delete your account and all its data at any time from Settings → Delete account. Deletion is immediate and permanent.
        </li>
        <li>
          Ask us for a copy of your data through <Contact />.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        All traffic is encrypted with HTTPS. Each user can only access their own tasks. Secrets such as API keys are stored encrypted on
        Cloudflare and are never sent to your browser.
      </p>

      <h2>Children</h2>
      <p>Task(AI)Do isn't intended for children under 13, and we don't knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we'll update the date at the top of this page.</p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <Contact />.
      </p>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p className="legal-lede">
        These terms apply when you use Task(AI)Do at <a href={SITE}>{SITE.replace("https://", "")}</a>. By signing in, you agree to them.
      </p>

      <h2>The service</h2>
      <p>
        Task(AI)Do lets you keep a task list and receive reminders by email and Slack. We may add, change or remove features over time.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You sign in with a Google or GitHub account. Keep that account secure, because it controls access to your tasks.</li>
        <li>You're responsible for what you do with your account.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You own the tasks and other content you add. You give us permission to store and process it only as needed to run the service, for
        example to show it to you and include it in your reminders.
      </p>

      <h2>Acceptable use</h2>
      <p>Don't use Task(AI)Do to:</p>
      <ul>
        <li>break the law or infringe anyone's rights;</li>
        <li>send spam or unwanted messages, including through a Slack webhook you don't control;</li>
        <li>try to access other users' data, or disrupt or overload the service.</li>
      </ul>
      <p>We may suspend accounts that break these rules.</p>

      <h2>Reminders are best-effort</h2>
      <p>
        We work to deliver reminders on time, but delivery depends on email and Slack providers outside our control. Messages can be delayed,
        filtered as spam or fail. Don't rely on Task(AI)Do as your only reminder for anything critical, such as medical, legal or financial
        deadlines.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided "as is", without warranties of any kind. To the extent the law allows, we aren't liable for indirect or
        consequential losses, or for losses caused by missed or late reminders.
      </p>

      <h2>Ending use</h2>
      <p>
        You can stop using Task(AI)Do at any time and delete your account from Settings. We may stop offering the service, and
        will try to give notice first.
      </p>

      <h2>Changes</h2>
      <p>If we change these terms, we'll update the date at the top. Continuing to use the service means you accept the new terms.</p>

      <h2>Contact</h2>
      <p>
        Questions: <Contact />. See also our{" "}
        <a href="/privacy" onClick={go("/privacy")}>
          Privacy Policy
        </a>
        .
      </p>
    </LegalLayout>
  );
}
