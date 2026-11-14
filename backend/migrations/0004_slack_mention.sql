-- Who to @mention in Slack reminders so Slack sends a phone notification:
--   NULL/''      no mention (channel notification settings apply)
--   'channel'    @channel
--   'U…'/'W…'    a specific Slack member ID
ALTER TABLE users ADD COLUMN slack_mention TEXT;
