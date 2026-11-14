-- Per-user daily message count for the AI assistant (keeps Gemini / Workers AI usage bounded).
CREATE TABLE assistant_usage (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,              -- YYYY-MM-DD (UTC)
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
