-- Users. One row per person; several OAuth identities (Google, GitHub) can link to it.
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE,
  name                  TEXT,
  avatar_url            TEXT,
  email_notifications   INTEGER NOT NULL DEFAULT 1,
  slack_notifications   INTEGER NOT NULL DEFAULT 0,
  slack_webhook_url     TEXT,
  slack_channel         TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE oauth_accounts (
  provider          TEXT NOT NULL,          -- 'google' | 'github'
  provider_user_id  TEXT NOT NULL,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX idx_oauth_user ON oauth_accounts(user_id);

-- Tasks (same fields as the original Flask model, now owned by a user).
-- All timestamps are ISO-8601 UTC strings.
CREATE TABLE tasks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  due_date         TEXT,
  priority         TEXT NOT NULL DEFAULT 'Medium',   -- Low | Medium | High | Critical
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed
  category         TEXT,
  tags             TEXT,
  is_reminder_set  INTEGER NOT NULL DEFAULT 0,
  reminder_time    TEXT,
  reminder_sent    INTEGER NOT NULL DEFAULT 0,
  due_notified     INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_tasks_user ON tasks(user_id);
CREATE INDEX idx_tasks_reminder ON tasks(reminder_sent, is_reminder_set, reminder_time);
CREATE INDEX idx_tasks_due ON tasks(due_notified, due_date);

-- Delivery log, shown in the UI and useful for debugging.
CREATE TABLE notification_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id     INTEGER,
  channel     TEXT NOT NULL,   -- 'email' | 'slack'
  kind        TEXT NOT NULL,   -- 'reminder' | 'due' | 'test'
  success     INTEGER NOT NULL,
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_log_user ON notification_log(user_id, created_at);
