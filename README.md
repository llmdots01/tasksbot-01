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
| POST | `/api/notifications/test` | `{ channel: "email" \| "slack" }` |
| GET | `/api/notifications/log` | Last 50 deliveries |
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
- `EMAIL_FROM` in `backend/wrangler.jsonc` is `TasksBot <onboarding@resend.dev>`. That sandbox sender **only delivers to your own Resend account email**. To email other users, verify a domain in Resend, set e.g. `TasksBot <reminders@yourdomain.com>`, then redeploy.

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
