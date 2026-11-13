import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import type { AppEnv, Env } from "./types";
import { authRoutes, requireAuth } from "./auth";
import { taskRoutes } from "./tasks";
import { settingsRoutes, slackRoutes } from "./settings";
import { processDueNotifications } from "./notify";

const app = new Hono<AppEnv>();

const corsMiddleware = async (c: Context<AppEnv>, next: Next) => {
  // FRONTEND_URL plus any extra origins (e.g. the pages.dev URL when a custom domain is primary).
  const origins = [c.env.FRONTEND_URL, ...(c.env.EXTRA_ORIGINS ?? "").split(",")]
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => new URL(u));
  const allowed = new Set([...origins.map((u) => u.origin), "http://localhost:5173"]);
  // Also allow Pages preview deployments, e.g. https://abc123.tasksbot.pages.dev
  const pagesHosts = origins.filter((u) => u.hostname.endsWith(".pages.dev")).map((u) => u.hostname);
  const isPreview = (origin: string) => origin.startsWith("https://") && pagesHosts.some((h) => origin.endsWith(`.${h}`));
  return cors({
    origin: (origin) => (allowed.has(origin) || isPreview(origin) ? origin : null),
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86400,
  })(c, next);
};
app.use("/api/*", corsMiddleware);
app.use("/auth/providers", corsMiddleware);

app.get("/", (c) => c.json({ message: "Task(AI)Do API", version: "2.0.0" }));
app.get("/health", (c) => c.json({ ok: true }));

app.route("/auth", authRoutes);
app.route("/integrations/slack", slackRoutes);

app.use("/api/tasks/*", requireAuth);
app.use("/api/tasks", requireAuth);
app.route("/api/tasks", taskRoutes);
app.route("/api", settingsRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      processDueNotifications(env).then((r) => {
        if (r.reminders || r.due) console.log(`Sent notifications: ${r.reminders} reminders, ${r.due} due alerts`);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
