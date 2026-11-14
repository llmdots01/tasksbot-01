-- Browser / phone push subscriptions (one row per device that enabled notifications).
CREATE TABLE push_subscriptions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint         TEXT NOT NULL UNIQUE,
  p256dh           TEXT NOT NULL,
  auth             TEXT NOT NULL,
  user_agent       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_success_at  TEXT
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);
