"use strict";

const path = require("node:path");
const { openDatabase } = require("./db");
const { createApp } = require("./app");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const PRODUCTION = process.env.NODE_ENV === "production";

const db = openDatabase(DATA_DIR);
const app = createApp({ db, dataDir: DATA_DIR, secureCookies: PRODUCTION });

// Clear expired sessions at startup and once a day.
const pruneSessions = () => db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
pruneSessions();
setInterval(pruneSessions, 24 * 60 * 60 * 1000).unref();

const server = app.listen(PORT, HOST, () => {
  console.log(`Line Check running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`Database: ${path.join(DATA_DIR, "linecheck.db")}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
