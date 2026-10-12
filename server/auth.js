"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { HttpError } = require("./lib/validate");

const scrypt = promisify(crypto.scrypt);

const COOKIE = "lc_session";
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/* ---------- Passwords (scrypt, stored as "scrypt$N$r$p$salt$hash") ---------- */

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(actual, expected);
}

/* ---------- Sessions ---------- */

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

function parseCookies(header = "") {
  const out = {};
  header.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function createSession(db, res, { userId, restaurantId, secure }) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare("INSERT INTO sessions (token_hash, user_id, restaurant_id, expires_at) VALUES (?, ?, ?, ?)").run(
    hashToken(token),
    userId,
    restaurantId,
    expires.toISOString()
  );
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure, expires, path: "/" });
}

function destroySession(db, req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  res.clearCookie(COOKIE, { path: "/" });
}

/** Attaches req.auth = { userId, restaurantId, role, user } when the cookie is a live session. */
function loadSession(db) {
  const lookup = db.prepare(`
    SELECT s.user_id, s.restaurant_id, m.role, u.name, u.email, u.title, u.phone
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN memberships m ON m.user_id = s.user_id AND m.restaurant_id = s.restaurant_id
    WHERE s.token_hash = ? AND s.expires_at > ?`);
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const row = lookup.get(hashToken(token), new Date().toISOString());
      if (row) {
        req.auth = {
          userId: row.user_id,
          restaurantId: row.restaurant_id,
          role: row.role,
          user: { id: row.user_id, name: row.name, email: row.email, title: row.title, phone: row.phone },
        };
      }
    }
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.auth) throw new HttpError(401, "Log in to continue.");
  next();
}

const isManager = (auth) => auth && (auth.role === "owner" || auth.role === "manager");

function requireManager(req, res, next) {
  if (!isManager(req.auth)) throw new HttpError(403, "Only owners and managers can do that.");
  next();
}

/**
 * CSRF guard: state-changing API calls must carry X-Requested-With: fetch.
 * Browsers won't send that header cross-site without a CORS preflight, which this server never allows.
 */
function requireFetchHeader(req, res, next) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("x-requested-with") !== "fetch") {
    throw new HttpError(403, "Request blocked.");
  }
  next();
}

/** In-memory limiter for login attempts: `max` tries per key per window. */
function attemptLimiter({ max = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  return {
    check(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.reset < now) {
        hits.set(key, { count: 1, reset: now + windowMs });
        return;
      }
      entry.count++;
      if (entry.count > max) throw new HttpError(429, "Too many attempts. Wait 15 minutes and try again.");
    },
    clear(key) {
      hits.delete(key);
    },
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  loadSession,
  requireAuth,
  requireManager,
  requireFetchHeader,
  attemptLimiter,
  isManager,
};
