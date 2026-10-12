"use strict";

const path = require("node:path");
const express = require("express");
const { HttpError } = require("./lib/validate");
const { loadSession, requireAuth, requireFetchHeader } = require("./auth");

const PUBLIC_DIR = path.join(__dirname, "..", "public");

const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/**
 * Builds the Express app.
 * @param {object} options
 * @param {import("node:sqlite").DatabaseSync} options.db
 * @param {string} options.dataDir      where uploads live
 * @param {{ send: Function, configured: boolean }} options.mailer  see server/mailer.js
 * @param {string} options.appUrl       public base URL used in emailed links
 * @param {boolean} [options.secureCookies]
 */
function createApp({ db, dataDir, mailer, appUrl, secureCookies = false }) {
  const ctx = { db, dataDir, mailer, appUrl: appUrl.replace(/\/$/, ""), secureCookies };
  const team = require("./routes/team")(ctx);
  const calendar = require("./routes/calendar")(ctx);
  const app = express();

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set(SECURITY_HEADERS);
    next();
  });
  app.use(loadSession(db));

  /* ---------- API ---------- */

  const api = express.Router();
  api.use(requireFetchHeader);
  api.use(express.json({ limit: "100kb" }));
  api.use("/auth", require("./routes/auth")(ctx));
  api.use(team.invites); // public: people accepting an invite may not have an account yet
  api.use(requireAuth);
  api.use(require("./routes/account")(ctx));
  api.use(team.team);
  api.use(calendar.api);
  api.use(require("./routes/restaurant")(ctx));
  api.use(require("./routes/daily-log")(ctx));
  api.use(require("./routes/deadlines")(ctx));
  api.use(require("./routes/inspection")(ctx));
  api.use(require("./routes/files")(ctx));
  api.use(require("./routes/employees")(ctx));
  api.use((req, res) => res.status(404).json({ error: "Not found." }));
  app.use("/api", api);

  /* ---------- Calendar feed (public, secret URL) ---------- */

  app.use(calendar.feed);

  /* ---------- Pages ---------- */

  // The dashboard needs a session; signed-in people skip the auth pages.
  app.get(["/app", "/app.html"], (req, res) => {
    if (!req.auth) return res.redirect("/login.html");
    res.sendFile(path.join(PUBLIC_DIR, "app.html"));
  });
  app.get(["/login.html", "/signup.html", "/forgot.html"], (req, res, next) => (req.auth ? res.redirect("/app.html") : next()));

  app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

  /* ---------- Errors ---------- */

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.too.large") err = new HttpError(413, "That file is too large. The limit is 20 MB.");
    if (err.type === "entity.parse.failed") err = new HttpError(400, "The request wasn't valid JSON.");
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    const message = status === 500 ? "Something went wrong on our end. Try again." : err.message;
    if (req.path.startsWith("/api/")) res.status(status).json({ error: message });
    else res.status(status).type("text").send(message);
  });

  return app;
}

module.exports = { createApp };
