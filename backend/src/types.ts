export interface Env {
  DB: D1Database;
  /** Workers AI (Llama). */
  AI: Ai;

  FRONTEND_URL: string;
  /** Comma-separated extra origins allowed to call the API (CORS). */
  EXTRA_ORIGINS?: string;
  API_URL: string;
  EMAIL_FROM: string;

  // Secrets
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  GEMINI_API_KEY?: string;
  /** VAPID private key as a JWK JSON string (Web Push). */
  VAPID_PRIVATE_KEY?: string;

  // AI assistant configuration (vars)
  GEMINI_MODEL?: string;
  GEMINI_THINKING?: string;
  LLAMA_MODEL?: string;
  ASSISTANT_DAILY_LIMIT?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_SUBJECT?: string;
}

export type AppEnv = { Bindings: Env; Variables: { userId: string } };

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  email_notifications: number;
  slack_notifications: number;
  slack_webhook_url: string | null;
  slack_channel: string | null;
  slack_mention: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: number;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  category: string | null;
  tags: string | null;
  is_reminder_set: number;
  reminder_time: string | null;
  reminder_sent: number;
  due_notified: number;
  created_at: string;
  updated_at: string;
}

export const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export const STATUSES = ["pending", "in_progress", "completed"] as const;
