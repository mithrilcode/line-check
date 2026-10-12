"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

/**
 * Opens (or creates) the SQLite database in `dataDir` and applies any
 * migrations newer than the database's `user_version`.
 * Migrations are the numbered .sql files in server/migrations, applied in order.
 */
function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "linecheck.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

  const migrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  const { user_version: current } = db.prepare("PRAGMA user_version").get();

  migrations.slice(current).forEach((file, i) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    transaction(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${current + i + 1}`);
    });
  });

  return db;
}

/** Runs `fn` inside a transaction, rolling back if it throws. */
function transaction(db, fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

module.exports = { openDatabase, transaction };
