"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { transaction } = require("../db");
const { HttpError, v } = require("../lib/validate");
const { toRestaurant } = require("../lib/mappers");
const auth = require("../auth");

/** Holding units every new restaurant starts with. */
const DEFAULT_UNITS = [
  ["Walk-in cooler", "cold"],
  ["Reach-in, line", "cold"],
  ["Walk-in freezer", "freezer"],
  ["Steam table", "hot"],
];

const RESET_MINUTES = 60;

module.exports = function authRoutes({ db, secureCookies, mailer, appUrl }) {
  const router = express.Router();
  const loginLimiter = auth.attemptLimiter();
  const resetLimiter = auth.attemptLimiter({ max: 5, windowMs: 60 * 60 * 1000 });

  const firstRestaurant = (userId) =>
    db.prepare("SELECT restaurant_id FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1").get(userId);

  /** Create a user, their restaurant and an owner membership, then log them in. */
  router.post("/signup", async (req, res) => {
    const body = v.object(req.body, "Sign-up details");
    const state = v.oneOf(body.state, "State", ["CA", "TX"]);
    const u = v.object(body.user, "Your details");
    const r = v.object(body.restaurant, "Restaurant details");

    const user = {
      name: v.text(u.name, "Your name", { max: 80, required: true }),
      title: v.text(u.title, "Your role", { max: 60 }),
      phone: v.text(u.phone, "Your phone", { max: 30 }),
      email: v.email(u.email),
      password: v.password(u.password),
    };
    const restaurant = {
      name: v.text(r.name, "Restaurant name", { max: 100, required: true }),
      address: v.text(r.address, "Street address", { max: 120 }),
      city: v.text(r.city, "City", { max: 60, required: true }),
      county: v.text(r.county, "County", { max: 60 }),
      zip: v.text(r.zip, "ZIP code", { max: 10 }),
      phone: v.text(r.phone, "Restaurant phone", { max: 30 }),
      permitNumber: v.text(r.permitNumber, "Permit number", { max: 60 }),
      servesAlcohol: v.flag(r.servesAlcohol),
    };

    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(user.email)) {
      throw new HttpError(409, "An account with that email already exists. Log in instead.");
    }

    const passwordHash = await auth.hashPassword(user.password);
    const userId = crypto.randomUUID();
    const restaurantId = crypto.randomUUID();

    transaction(db, () => {
      db.prepare("INSERT INTO users (id, email, password_hash, name, title, phone) VALUES (?, ?, ?, ?, ?, ?)").run(
        userId, user.email, passwordHash, user.name, user.title, user.phone
      );
      db.prepare(
        `INSERT INTO restaurants (id, name, state, address, city, county, zip, phone, permit_number, serves_alcohol)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        restaurantId, restaurant.name, state, restaurant.address, restaurant.city, restaurant.county,
        restaurant.zip, restaurant.phone, restaurant.permitNumber, restaurant.servesAlcohol
      );
      db.prepare("INSERT INTO memberships (user_id, restaurant_id, role) VALUES (?, ?, 'owner')").run(userId, restaurantId);
      const addUnit = db.prepare("INSERT INTO holding_units (id, restaurant_id, name, kind, position) VALUES (?, ?, ?, ?, ?)");
      DEFAULT_UNITS.forEach(([name, kind], i) => addUnit.run(crypto.randomUUID(), restaurantId, name, kind, i));
    });

    auth.createSession(db, res, { userId, restaurantId, secure: secureCookies });
    res.status(201).json({ ok: true });
  });

  router.post("/login", async (req, res) => {
    const body = v.object(req.body, "Login details");
    const email = v.email(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const key = `${req.ip}|${email}`;
    loginLimiter.check(key);

    const user = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email);
    const valid = user ? await auth.verifyPassword(password, user.password_hash) : false;
    if (!valid) throw new HttpError(401, "That email and password don't match.");

    const membership = firstRestaurant(user.id);
    if (!membership) throw new HttpError(403, "This account isn't linked to a restaurant anymore. Ask your manager for a new invite.");

    loginLimiter.clear(key);
    auth.createSession(db, res, { userId: user.id, restaurantId: membership.restaurant_id, secure: secureCookies });
    res.json({ ok: true });
  });

  router.post("/logout", (req, res) => {
    auth.destroySession(db, req, res);
    res.json({ ok: true });
  });

  /** The signed-in user, their current restaurant, their role there, and every restaurant they belong to. */
  router.get("/me", auth.requireAuth, (req, res) => {
    const restaurant = db.prepare("SELECT * FROM restaurants WHERE id = ?").get(req.auth.restaurantId);
    const restaurants = db
      .prepare(
        `SELECT r.id, r.name, r.state, m.role FROM memberships m JOIN restaurants r ON r.id = m.restaurant_id
         WHERE m.user_id = ? ORDER BY r.name`
      )
      .all(req.auth.userId);
    res.json({ user: req.auth.user, restaurant: toRestaurant(restaurant), role: req.auth.role, restaurants });
  });

  /** Switches the session to another restaurant the user belongs to. */
  router.post("/switch", auth.requireAuth, (req, res) => {
    const restaurantId = v.text(req.body.restaurantId, "Restaurant", { max: 60, required: true });
    const member = db.prepare("SELECT 1 FROM memberships WHERE user_id = ? AND restaurant_id = ?").get(req.auth.userId, restaurantId);
    if (!member) throw new HttpError(403, "You don't have access to that restaurant.");
    auth.endSession(db, req);
    auth.createSession(db, res, { userId: req.auth.userId, restaurantId, secure: secureCookies });
    res.json({ ok: true });
  });

  /* ---------- Password reset ---------- */

  /** Always answers the same way so the form can't be used to find out who has an account. */
  router.post("/forgot", async (req, res) => {
    const email = v.email(v.object(req.body, "Request").email);
    resetLimiter.check(`${req.ip}|${email}`);

    const user = db.prepare("SELECT id, name, email FROM users WHERE email = ?").get(email);
    if (user) {
      const { token, hash } = auth.newToken();
      const expires = new Date(Date.now() + RESET_MINUTES * 60 * 1000).toISOString();
      db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(hash, user.id, expires);
      const link = `${appUrl}/reset.html?token=${token}`;
      await mailer
        .send({
          to: user.email,
          subject: "Reset your Line Check password",
          text: [
            `Hi ${user.name},`,
            "",
            "Someone asked to reset the password for your Line Check account. To choose a new password, open this link:",
            "",
            link,
            "",
            `The link works once and expires in ${RESET_MINUTES} minutes. If you didn't ask for this, ignore this email and your password stays the same.`,
          ].join("\n"),
        })
        .catch((err) => console.error("Password reset email failed:", err.message));
    }
    res.json({ ok: true });
  });

  router.post("/reset", async (req, res) => {
    const body = v.object(req.body, "Reset details");
    const token = typeof body.token === "string" ? body.token : "";
    const password = v.password(body.password);
    const row = db
      .prepare("SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
      .get(auth.hashToken(token), new Date().toISOString());
    if (!row) throw new HttpError(400, "This reset link has expired or was already used. Ask for a new one.");

    const passwordHash = await auth.hashPassword(password);
    transaction(db, () => {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, row.user_id);
      db.prepare("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(new Date().toISOString(), row.user_id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id); // sign out everywhere
    });

    const membership = firstRestaurant(row.user_id);
    if (membership) auth.createSession(db, res, { userId: row.user_id, restaurantId: membership.restaurant_id, secure: secureCookies });
    res.json({ ok: true, signedIn: Boolean(membership) });
  });

  return router;
};
