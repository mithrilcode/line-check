"use strict";

const path = require("node:path");
const { openDatabase } = require("./db");
const { createApp } = require("./app");
const { createMailer } = require("./mailer");
const { runReminders } = require("./reminders");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const PRODUCTION = process.env.NODE_ENV === "production";
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const REMINDER_HOUR = Number(process.env.REMINDER_HOUR ?? 7);

const db = openDatabase(DATA_DIR);
const mailer = createMailer({
  smtpUrl: process.env.SMTP_URL,
  from: process.env.MAIL_FROM || "Line Check <no-reply@localhost>",
  outboxDir: path.join(DATA_DIR, "outbox"),
});
const app = createApp({ db, dataDir: DATA_DIR, mailer, appUrl: APP_URL, secureCookies: PRODUCTION });

/* ---------- Housekeeping ---------- */

function pruneExpired() {
  const now = new Date().toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  db.prepare("DELETE FROM password_resets WHERE expires_at <= ?").run(now);
}

/** Sends the daily reminder email once the server's local clock passes REMINDER_HOUR. */
async function remindersTick() {
  if (new Date().getHours() < REMINDER_HOUR) return;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  try {
    const sent = await runReminders({ db, mailer, appUrl: APP_URL, today });
    if (sent) console.log(`Sent ${sent} reminder email${sent === 1 ? "" : "s"} for ${today}.`);
  } catch (err) {
    console.error("Reminder run failed:", err);
  }
}

pruneExpired();
setInterval(pruneExpired, 24 * 60 * 60 * 1000).unref();
remindersTick();
setInterval(remindersTick, 60 * 60 * 1000).unref();

/* ---------- Start ---------- */

const server = app.listen(PORT, HOST, () => {
  console.log(`Line Check running at ${APP_URL}`);
  console.log(`Database: ${path.join(DATA_DIR, "linecheck.db")}`);
  console.log(mailer.configured ? "Email: sending through SMTP_URL" : `Email: SMTP_URL not set, saving messages to ${path.join(DATA_DIR, "outbox")}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
