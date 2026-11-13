import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Env, UserRow } from "./types";
import { randomToken, signJwt, verifyJwt } from "./crypto";

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const STATE_COOKIE = "oauth_state";

type Provider = "google" | "github";

interface Profile {
  providerUserId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

function configured(env: Env, p: Provider): boolean {
  return p === "google"
    ? Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
    : Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

function callbackUrl(env: Env, p: Provider): string {
  return `${env.API_URL.replace(/\/$/, "")}/auth/${p}/callback`;
}

function frontendRedirect(env: Env, path: string, fragment: Record<string, string>): string {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  return `${base}${path}#${new URLSearchParams(fragment).toString()}`;
}

async function fetchGoogleProfile(env: Env, code: string): Promise<Profile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: callbackUrl(env, "google"),
      grant_type: "authorization_code",
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!token.access_token) throw new Error(`Google token exchange failed: ${token.error ?? tokenRes.status}`);

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const info = (await infoRes.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!info.email || !info.email_verified) throw new Error("Your Google account has no verified email address.");
  return { providerUserId: info.sub, email: info.email.toLowerCase(), name: info.name ?? null, avatarUrl: info.picture ?? null };
}

async function fetchGithubProfile(env: Env, code: string): Promise<Profile> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(env, "github"),
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!token.access_token) throw new Error(`GitHub token exchange failed: ${token.error ?? tokenRes.status}`);

  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "tasksbot",
  };
  const user = (await (await fetch("https://api.github.com/user", { headers })).json()) as {
    id: number;
    login: string;
    name?: string | null;
    avatar_url?: string;
  };
  const emails = (await (await fetch("https://api.github.com/user/emails", { headers })).json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;
  const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified) : undefined;
  if (!primary) throw new Error("Your GitHub account has no verified email address.");
  return {
    providerUserId: String(user.id),
    email: primary.email.toLowerCase(),
    name: user.name || user.login,
    avatarUrl: user.avatar_url ?? null,
  };
}

/** Find the user for this identity, link it to an existing user with the same verified email, or create one. */
async function upsertUser(db: D1Database, provider: Provider, p: Profile): Promise<string> {
  const linked = await db
    .prepare("SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?")
    .bind(provider, p.providerUserId)
    .first<{ user_id: string }>();

  let userId = linked?.user_id;
  if (!userId) {
    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(p.email).first<{ id: string }>();
    userId = existing?.id ?? crypto.randomUUID();
    const stmts = [];
    if (!existing) {
      stmts.push(
        db.prepare("INSERT INTO users (id, email, name, avatar_url) VALUES (?, ?, ?, ?)").bind(userId, p.email, p.name, p.avatarUrl),
      );
    }
    stmts.push(
      db.prepare("INSERT INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)").bind(provider, p.providerUserId, userId),
    );
    await db.batch(stmts);
  }

  // Fill in profile details that are still missing.
  await db
    .prepare(
      "UPDATE users SET name = COALESCE(name, ?), avatar_url = COALESCE(avatar_url, ?), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    )
    .bind(p.name, p.avatarUrl, userId)
    .run();
  return userId;
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/providers", (c) =>
  c.json({
    google: configured(c.env, "google"),
    github: configured(c.env, "github"),
    slack: Boolean(c.env.SLACK_CLIENT_ID && c.env.SLACK_CLIENT_SECRET),
  }),
);

authRoutes.get("/:provider/login", (c) => {
  const provider = c.req.param("provider") as Provider;
  if (provider !== "google" && provider !== "github") return c.text("Unknown provider", 404);
  if (!configured(c.env, provider)) return c.text(`${provider} login is not configured on the server`, 501);

  const state = randomToken();
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "Lax", path: "/auth", maxAge: 600 });

  const url =
    provider === "google"
      ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
      : new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", provider === "google" ? c.env.GOOGLE_CLIENT_ID! : c.env.GITHUB_CLIENT_ID!);
  url.searchParams.set("redirect_uri", callbackUrl(c.env, provider));
  url.searchParams.set("state", state);
  if (provider === "google") {
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("prompt", "select_account");
  } else {
    url.searchParams.set("scope", "read:user user:email");
  }
  return c.redirect(url.toString());
});

authRoutes.get("/:provider/callback", async (c) => {
  const provider = c.req.param("provider") as Provider;
  if (provider !== "google" && provider !== "github") return c.text("Unknown provider", 404);

  const expected = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/auth", secure: true });
  const { code, state, error } = c.req.query();

  const fail = (msg: string) => c.redirect(frontendRedirect(c.env, "/login", { error: msg }));
  if (error) return fail(`Sign-in was cancelled (${error}).`);
  if (!code || !state || !expected || state !== expected) return fail("Sign-in session expired. Please try again.");

  try {
    const profile = provider === "google" ? await fetchGoogleProfile(c.env, code) : await fetchGithubProfile(c.env, code);
    const userId = await upsertUser(c.env.DB, provider, profile);
    const token = await signJwt({ sub: userId }, c.env.JWT_SECRET, SESSION_TTL);
    return c.redirect(frontendRedirect(c.env, "/auth/callback", { token }));
  } catch (e) {
    console.error("OAuth callback failed", e);
    return fail(e instanceof Error ? e.message : "Sign-in failed.");
  }
});

/** Requires `Authorization: Bearer <jwt>`; sets c.var.userId. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = token ? await verifyJwt<{ sub: string }>(token, c.env.JWT_SECRET) : null;
  if (!payload?.sub) return c.json({ error: "Unauthorized" }, 401);

  const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(payload.sub).first();
  if (!exists) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", payload.sub);
  await next();
});

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatar_url: u.avatar_url,
    email_notifications: Boolean(u.email_notifications),
    slack_notifications: Boolean(u.slack_notifications),
    slack_connected: Boolean(u.slack_webhook_url),
    slack_channel: u.slack_channel,
  };
}
