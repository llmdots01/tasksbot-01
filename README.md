# Task(AI)Do: Task Reminder System on Cloudflare

Create tasks with due dates and reminders. Get notified by **email** (via [Resend](https://resend.com)) and/or **Slack**. Sign in with **Google** or **GitHub**.

| Part | Runs on | Live URL |
|---|---|---|
| API (`backend/`) | Cloudflare Workers + D1 + Cron Triggers | https://tasksbot-api.tasksbot01.workers.dev |
| Web app (`frontend/`) | Cloudflare Pages (React + Vite) | https://aitask.pareops.in (also https://tasksbot.pages.dev) |

This is a port of the original Flask + Streamlit app, which could not run on Cloudflare. The data model is the same: title, description, due date, priority, status, category, tags and reminder time. Each task now belongs to a signed-in user.

## How it works

```
Browser (Pages SPA) ──Bearer JWT──▶ Worker API ──▶ D1 (users, tasks, notification_log)
                                        ▲
             Cron "* * * * *" ──────────┘──▶ Resend (email)  /  Slack incoming webhook
```

- **Auth**: OAuth 2.0 with Google or GitHub. The Worker exchanges the code, links identities that share a verified email to the same user, and returns a 30-day HS256 JWT to the SPA in the URL fragment. The SPA sends it as `Authorization: Bearer …`.
- **Reminders**: every minute, the cron job atomically claims tasks whose `reminder_time` or `due_date` has passed. It uses `UPDATE … RETURNING`, so overlapping runs never double-send. Each claimed task is sent on every channel the owner has enabled, and each attempt is logged.
  - **Reminder**: fires at the reminder time you pick (presets: at due time, 15 min, 1 h or 1 day before).
  - **Due alert**: fires once when the task becomes due. It doesn't fire for tasks created with a past due date.
  - Changing a reminder or due time re-arms that notification. Completed tasks never notify.
- **Email**: each user can turn email on or off in Settings. Sends use Resend's `Idempotency-Key`, so a retry can't send a duplicate.
- **Slack**: users connect either with one-click **Add to Slack** (OAuth with the `incoming-webhook` scope, which lets them pick a channel or DM) or by pasting an incoming webhook URL. Only `https://hooks.slack.com/services/…` URLs are accepted.
- **Settings page**: email and Slack toggles, test-send buttons, and a log of recent deliveries with error messages.

## AI assistant

Signed-in users get an **Ask AI** button (bottom right) that opens a chat. The assistant acts as that user through the same code paths as the app. It can:
- list, create, update, complete and delete tasks;
- turn email and Slack notifications on or off, or connect Slack with a webhook URL;
- send test notifications and read the delivery history.

It asks before deleting a task or disconnecting Slack, and it can't delete the account.

- **Models:** Gemini (`GEMINI_MODEL`, default `gemini-3.5-flash-lite`) is tried first. If it errors or is overloaded, the assistant falls back to Llama 3.3 70B on Cloudflare Workers AI (`LLAMA_MODEL`), which is free within the Workers AI daily allowance. Users can pin either model in the chat. The fallback only happens if nothing was changed yet, so actions are never repeated.
- **Secrets:** `GEMINI_API_KEY`. Without it, only Llama is used. The Workers AI binding `AI` is set in `wrangler.jsonc`.
- **Limits:** each user gets `ASSISTANT_DAILY_LIMIT` messages per day (default 200), counted in the `assistant_usage` table.
- **Time zones:** the browser sends its time zone, so "tomorrow at 6pm" means the user's local 6pm.

## Install on your phone (PWA)

Task(AI)Do is an installable Progressive Web App:
- **Android (Chrome, Edge, Samsung Internet):** tap **Get the app** on the landing page or **Install app** in the profile menu to get the native install prompt.
- **iPhone / iPad (Safari):** the same button shows how to use **Share → Add to Home Screen**.
- **Desktop Chrome/Edge:** use the install icon in the address bar.

Once installed, it opens full-screen from its own icon, follows the dark/light theme in the status bar, and has a long-press **New task** shortcut. The service worker (`frontend/public/sw.js`) caches the app shell, so it opens offline. Pages use network-first, hashed `/assets/*` files are cache-first, and API calls are never cached. The manifest is `frontend/public/manifest.webmanifest`, and icons are in `frontend/public/icons/`, rendered from `icon.svg`.

## Phone push notifications

Reminders and due alerts are also sent as push notifications to every device where the user turned them on (**Settings → Phone notifications**). They arrive even when the app is closed.

- **Android / desktop Chrome, Edge, Firefox:** works in the browser or the installed app.
- **iPhone / iPad (iOS 16.4+):** only after adding the app to the Home Screen and opening it from there. That's an Apple requirement, and the Settings card explains it.
- **Implementation:** Web Push with VAPID (RFC 8292) and `aes128gcm` payload encryption (RFC 8291), written with WebCrypto in `backend/src/webpush.ts` (no Node dependencies).
  - Subscriptions live in `push_subscriptions` (migration `0003`). Dead ones (404/410) are removed automatically.
  - Only real browser push services can be targeted: Google, Apple, Mozilla, Microsoft.
- **Configuration:** `VAPID_PUBLIC_KEY` and `VAPID_SUBJECT` vars in `wrangler.jsonc`, plus the `VAPID_PRIVATE_KEY` secret (JWK JSON of the matching P-256 private key). If you rotate the key pair, existing subscriptions stop working, and users re-enable notifications on each device.
- **Display:** the service worker shows the notification, formatting the due time in the device's own time zone. Tapping it opens Tasks.

## API

All `/api/*` routes need `Authorization: Bearer <token>`.

| Method | Path | |
|---|---|---|
| GET | `/auth/providers` | Which sign-in providers / Slack app are configured |
| GET | `/auth/{google\|github}/login` | Start OAuth |
| GET | `/api/me` | Current user + notification settings |
| PUT | `/api/settings` | `{ email_notifications?, slack_notifications?, slack_webhook_url? }` |
| POST | `/api/slack/ticket` | Returns URL to start "Add to Slack" |
| DELETE | `/api/slack` | Disconnect Slack |
| POST | `/api/notifications/test` | `{ channel: "email" \| "slack" \| "push" }` |
| GET | `/api/notifications/log?limit=&channel=` | Recent deliveries (up to 200), optionally email, slack or push only |
| GET | `/api/push/status` | `{ configured, publicKey, devices }` |
| POST | `/api/push/subscribe` | Browser `PushSubscription` JSON for this device |
| POST | `/api/push/unsubscribe` | `{ endpoint }` |
| POST | `/api/assistant/chat` | `{ messages, provider?: "auto"\|"gemini"\|"llama", timezone? }` → `{ reply, actions, provider }` |
| GET | `/api/tasks?status=&priority=&q=` | List tasks |
| POST | `/api/tasks` | Create (`title`, `due_date` required) |
| GET/PUT/DELETE | `/api/tasks/:id` | Read / update / delete |
| GET | `/api/tasks/statistics` | Totals, overdue, due in 24 h, completion rate |

Dates are ISO-8601 and stored in UTC. The browser shows them in local time.

## Finishing setup (one-time)

The Worker, D1 database, cron trigger and Pages site are already deployed. Sign-in and notifications start working once these secrets are set. Run each command from `backend/` with `npx wrangler secret put <NAME>`. You can also set them in the Cloudflare dashboard → Workers → tasksbot-api → Settings → Variables.

### 1. Google sign-in
Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (Web application).
- Authorized redirect URI: `https://tasksbot-api.tasksbot01.workers.dev/auth/google/callback`
- Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

### 2. GitHub sign-in
GitHub → Settings → Developer settings → **OAuth Apps** → New.
- Homepage: `https://aitask.pareops.in`
- Callback URL: `https://tasksbot-api.tasksbot01.workers.dev/auth/github/callback`
- Secrets: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

### 3. Email via Resend
- Create an API key → secret `RESEND_API_KEY`.
- `EMAIL_FROM` in `backend/wrangler.jsonc` is `"Task(AI)Do" <reminders@aitest.pareops.in>`, sent from the domain verified in Resend (`aitest.pareops.in`, with DNS records on Route 53). For local development, `.dev.vars.example` uses Resend's sandbox sender `onboarding@resend.dev`, which only delivers to your own Resend account email.

### 4. Slack "Add to Slack" (optional)
Pasting a webhook URL works without this. For the one-click button:
api.slack.com/apps → **Create New App** → OAuth & Permissions:
- Redirect URL: `https://tasksbot-api.tasksbot01.workers.dev/integrations/slack/callback`
- Bot token scope: `incoming-webhook`
- Enable **Manage Distribution** if people outside your workspace will use it.
- Secrets: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`

`JWT_SECRET` is already set to a random value. Rotating it signs everyone out.

### 5. Auto-deploy from GitHub
Add the repository secrets `CLOUDFLARE_API_TOKEN` (permissions: Workers Scripts Edit, Cloudflare Pages Edit, D1 Edit) and `CLOUDFLARE_ACCOUNT_ID` = `22b711acfaab8d8ad645efa3a9702891`. Every push to `main` then runs D1 migrations, deploys the Worker, and builds and deploys the Pages site ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

## Local development

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars        # fill in what you have; JWT_SECRET is required
npm run db:migrate:local
npm run dev                            # http://localhost:8787  (cron: curl "localhost:8787/__scheduled?cron=*+*+*+*+*")
```

```bash
cd frontend
npm install
cp .env.example .env.local             # VITE_API_URL=http://localhost:8787
npm run dev                            # http://localhost:5173
```

For local OAuth, also register `http://localhost:8787/auth/{google,github}/callback` with each provider.

## Manual deploy

```bash
cd backend && npx wrangler d1 migrations apply tasksbot-db --remote && npx wrangler deploy
cd frontend && VITE_API_URL=https://tasksbot-api.tasksbot01.workers.dev npm run deploy
```

Schema changes go in a new file under `backend/migrations/` (e.g. `0002_….sql`).

## Custom domain

The site is served at `aitask.pareops.in` through a CNAME to `tasksbot.pages.dev` (DNS on Route 53), set up under the Pages project → Custom domains. In `backend/wrangler.jsonc`:
- `FRONTEND_URL` is the main domain. Sign-in redirects back to it, and links in emails and Slack messages point to it.
- `EXTRA_ORIGINS` lists other origins allowed to call the API. Preview URLs under any listed `*.pages.dev` host are allowed automatically.
