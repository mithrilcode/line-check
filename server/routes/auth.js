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

module.exports = function authRoutes({ db, secureCookies }) {
  const router = express.Router();
  const limiter = auth.attemptLimiter();

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
    limiter.check(key);

    const user = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email);
    const valid = user ? await auth.verifyPassword(password, user.password_hash) : false;
    if (!valid) throw new HttpError(401, "That email and password don't match.");

    const membership = db
      .prepare("SELECT restaurant_id FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1")
      .get(user.id);
    if (!membership) throw new HttpError(403, "This account isn't linked to a restaurant.");

    limiter.clear(key);
    auth.createSession(db, res, { userId: user.id, restaurantId: membership.restaurant_id, secure: secureCookies });
    res.json({ ok: true });
  });

  router.post("/logout", (req, res) => {
    auth.destroySession(db, req, res);
    res.json({ ok: true });
  });

  /** The signed-in user, their restaurant and their role there. */
  router.get("/me", auth.requireAuth, (req, res) => {
    const restaurant = db.prepare("SELECT * FROM restaurants WHERE id = ?").get(req.auth.restaurantId);
    res.json({ user: req.auth.user, restaurant: toRestaurant(restaurant), role: req.auth.role });
  });

  return router;
};
