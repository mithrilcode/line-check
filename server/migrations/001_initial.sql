-- Line Check schema, version 1.
-- Every business table is scoped to a restaurant. IDs are UUIDs (TEXT).
-- Dates are ISO strings: YYYY-MM-DD for calendar dates, HH:MM for times of day,
-- and full ISO-8601 UTC timestamps for created/updated columns.

-- ---------- Accounts ----------

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE restaurants (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  state               TEXT NOT NULL CHECK (state IN ('CA', 'TX')),
  address             TEXT NOT NULL DEFAULT '',
  city                TEXT NOT NULL DEFAULT '',
  county              TEXT NOT NULL DEFAULT '',
  zip                 TEXT NOT NULL DEFAULT '',
  phone               TEXT NOT NULL DEFAULT '',
  permit_number       TEXT NOT NULL DEFAULT '',
  serves_alcohol      INTEGER NOT NULL DEFAULT 0 CHECK (serves_alcohol IN (0, 1)),
  walkthrough_started TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A user's access to a restaurant. Owners and managers can open employee files.
CREATE TABLE memberships (
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, restaurant_id)
);
CREATE INDEX memberships_restaurant ON memberships (restaurant_id);

-- Login sessions. Only a SHA-256 hash of the cookie token is stored.
CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sessions_user ON sessions (user_id);

-- ---------- Today's log ----------

CREATE TABLE holding_units (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('cold', 'freezer', 'hot')),
  position      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX holding_units_restaurant ON holding_units (restaurant_id);

CREATE TABLE readings (
  id                TEXT PRIMARY KEY,
  restaurant_id     TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  log_date          TEXT NOT NULL,
  logged_at         TEXT NOT NULL,
  check_key         TEXT NOT NULL,
  label             TEXT NOT NULL,
  value             REAL NOT NULL,
  unit              TEXT NOT NULL,
  passed            INTEGER NOT NULL CHECK (passed IN (0, 1)),
  initials          TEXT NOT NULL,
  corrective_action TEXT NOT NULL DEFAULT '',
  created_by        TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX readings_day ON readings (restaurant_id, log_date);

CREATE TABLE shift_checks (
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  log_date      TEXT NOT NULL,
  check_id      TEXT NOT NULL,
  checked_at    TEXT NOT NULL,
  checked_by    TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (restaurant_id, log_date, check_id)
);

CREATE TABLE cooling_batches (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  log_date      TEXT NOT NULL,
  food          TEXT NOT NULL,
  start_time    TEXT NOT NULL,
  start_temp    REAL NOT NULL,
  initials      TEXT NOT NULL,
  check2_temp   REAL,
  check2_at     TEXT,
  check6_temp   REAL,
  check6_at     TEXT,
  created_by    TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX cooling_day ON cooling_batches (restaurant_id, log_date);

-- ---------- Permits & renewals ----------

CREATE TABLE deadlines (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('permit', 'cert', 'fire', 'service', 'labor')),
  cycle_months  INTEGER NOT NULL DEFAULT 0 CHECK (cycle_months >= 0),
  agency        TEXT NOT NULL DEFAULT '',
  due_date      TEXT,
  last_done     TEXT,
  notes         TEXT NOT NULL DEFAULT '',
  done          INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX deadlines_restaurant ON deadlines (restaurant_id);

-- ---------- Inspection prep ----------

CREATE TABLE inspection_ticks (
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL,
  checked_on    TEXT NOT NULL,
  PRIMARY KEY (restaurant_id, item_id)
);

-- ---------- Uploaded files (stored on disk under DATA_DIR/uploads/<id>) ----------

CREATE TABLE files (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  uploaded_by   TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX files_restaurant ON files (restaurant_id);

-- ---------- Employee files ----------

CREATE TABLE employees (
  id                TEXT PRIMARY KEY,
  restaurant_id     TEXT NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  position          TEXT NOT NULL DEFAULT '',
  hire_date         TEXT,
  end_date          TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'former')),
  phone             TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  emergency_contact TEXT NOT NULL DEFAULT '',
  serves_alcohol    INTEGER NOT NULL DEFAULT 0 CHECK (serves_alcohol IN (0, 1)),
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX employees_restaurant ON employees (restaurant_id);

CREATE TABLE employee_certifications (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  number      TEXT NOT NULL DEFAULT '',
  provider    TEXT NOT NULL DEFAULT '',
  issued_on   TEXT,
  expires_on  TEXT,
  file_id     TEXT REFERENCES files (id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX employee_certifications_employee ON employee_certifications (employee_id);

CREATE TABLE employee_records (
  id              TEXT PRIMARY KEY,
  employee_id     TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  record_date     TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('verbal', 'written', 'final', 'suspension', 'illness', 'injury', 'training', 'review', 'commend', 'note')),
  summary         TEXT NOT NULL,
  details         TEXT NOT NULL DEFAULT '',
  recorded_by     TEXT NOT NULL DEFAULT '',
  acknowledged_on TEXT,
  file_id         TEXT REFERENCES files (id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX employee_records_employee ON employee_records (employee_id);

CREATE TABLE employee_onboarding (
  employee_id  TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL,
  completed_on TEXT NOT NULL,
  PRIMARY KEY (employee_id, item_id)
);

CREATE TABLE employee_documents (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  uploaded_on TEXT NOT NULL,
  file_id     TEXT NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX employee_documents_employee ON employee_documents (employee_id);
