import type { Env } from "../types";

/** Count one AI request against the user's daily cap. Returns an error message if the cap is exceeded. */
export async function consumeAssistantQuota(env: Env, userId: string): Promise<string | null> {
  const limit = Number(env.ASSISTANT_DAILY_LIMIT) || 200;
  const day = new Date().toISOString().slice(0, 10);
  const usage = await env.DB.prepare(
    `INSERT INTO assistant_usage (user_id, day, count) VALUES (?, ?, 1)
     ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1 RETURNING count`,
  )
    .bind(userId, day)
    .first<{ count: number }>();
  return (usage?.count ?? 0) > limit ? `Daily AI limit of ${limit} requests reached. Try again tomorrow.` : null;
}
