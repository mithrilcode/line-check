-- Line Check schema, version 2: team invitations, password resets,
-- deadline reminders and the calendar feed.

-- Whether the user wants the daily deadline reminder email.
ALTER TABLE users ADD COLUMN email_reminders INTEGER NOT NULL DEFAULT 1 CHECK (email_reminders IN (0, 1));

-- Secret token in the restaurant's calendar feed URL (/calendar/<token>.ics).
ALTER TABLE restaurants ADD COLUMN calendar_token TEXT;
CREATE UNIQUE INDEX restaurants_calendar_token ON restaurants (calendar_token);

-- Pending and accepted invitations. Only a SHA-256 hash of the link token is stored.
CREATE TABLE invitations (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  email         TEXT NOT NULL COLLATE NOCASE,
  role          TEXT NOT NULL CHECK (role IN ('manager', 'staff')),
  token_hash    TEXT NOT NULL UNIQUE,
  invited_by    TEXT REFERENCES users (id) ON DELETE SET NULL,
  expires_at    TEXT NOT NULL,
  accepted_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX invitations_restaurant ON invitations (restaurant_id);

-- Single-use password reset links. Only a hash of the token is stored.
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX password_resets_user ON password_resets (user_id);

-- One reminder digest per restaurant per day.
CREATE TABLE reminder_runs (
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  run_date      TEXT NOT NULL,
  items_sent    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (restaurant_id, run_date)
);
