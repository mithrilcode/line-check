"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { HttpError, v } = require("../lib/validate");
const { toUnit, toReading, toCooling } = require("../lib/mappers");

const notFound = () => new HttpError(404, "That entry no longer exists.");

module.exports = function dailyLogRoutes({ db }) {
  const router = express.Router();

  /* ---------- Holding units ---------- */

  router.get("/units", (req, res) => {
    const rows = db.prepare("SELECT * FROM holding_units WHERE restaurant_id = ? ORDER BY position, name").all(req.auth.restaurantId);
    res.json(rows.map(toUnit));
  });

  router.post("/units", (req, res) => {
    const name = v.text(req.body.name, "Unit name", { max: 40, required: true });
    const kind = v.oneOf(req.body.kind, "Unit type", ["cold", "freezer", "hot"]);
    const { next } = db
      .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM holding_units WHERE restaurant_id = ?")
      .get(req.auth.restaurantId);
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO holding_units (id, restaurant_id, name, kind, position) VALUES (?, ?, ?, ?, ?)").run(
      id, req.auth.restaurantId, name, kind, next
    );
    res.status(201).json({ id, name, kind });
  });

  router.delete("/units/:id", (req, res) => {
    db.prepare("DELETE FROM holding_units WHERE id = ? AND restaurant_id = ?").run(req.params.id, req.auth.restaurantId);
    res.status(204).end();
  });

  /* ---------- One day's log ---------- */

  function readDay(restaurantId, date) {
    const temps = db.prepare("SELECT * FROM readings WHERE restaurant_id = ? AND log_date = ? ORDER BY logged_at, created_at").all(restaurantId, date);
    const cooling = db.prepare("SELECT * FROM cooling_batches WHERE restaurant_id = ? AND log_date = ? ORDER BY start_time, created_at").all(restaurantId, date);
    const checks = db.prepare("SELECT check_id, checked_at FROM shift_checks WHERE restaurant_id = ? AND log_date = ?").all(restaurantId, date);
    return {
      date,
      temps: temps.map(toReading),
      cooling: cooling.map(toCooling),
      checks: Object.fromEntries(checks.map((c) => [c.check_id, c.checked_at])),
    };
  }

  router.get("/days/:date", (req, res) => {
    res.json(readDay(req.auth.restaurantId, v.date(req.params.date, "Date", { required: true })));
  });

  router.post("/days/:date/readings", (req, res) => {
    const date = v.date(req.params.date, "Date", { required: true });
    const b = req.body;
    const passed = v.flag(b.ok);
    const reading = {
      id: crypto.randomUUID(),
      at: v.time(b.at, "Time"),
      key: v.text(b.key, "Check", { max: 80, required: true }),
      what: v.text(b.what, "Check name", { max: 80, required: true }),
      value: v.number(b.value, "Reading"),
      unit: v.oneOf(b.unit, "Unit", ["°F", "ppm"]),
      by: v.text(b.by, "Initials", { max: 4, required: true }).toUpperCase(),
      action: v.text(b.action, "Corrective action", { max: 200 }),
    };
    if (!passed && !reading.action) throw new HttpError(400, "Record a corrective action for an out-of-range reading.");

    db.prepare(
      `INSERT INTO readings (id, restaurant_id, log_date, logged_at, check_key, label, value, unit, passed, initials, corrective_action, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      reading.id, req.auth.restaurantId, date, reading.at, reading.key, reading.what, reading.value,
      reading.unit, passed, reading.by, reading.action, req.auth.userId
    );
    res.status(201).json({ ...reading, ok: passed === 1 });
  });

  router.delete("/readings/:id", (req, res) => {
    db.prepare("DELETE FROM readings WHERE id = ? AND restaurant_id = ?").run(req.params.id, req.auth.restaurantId);
    res.status(204).end();
  });

  router.put("/days/:date/checks/:checkId", (req, res) => {
    const date = v.date(req.params.date, "Date", { required: true });
    const checkId = v.text(req.params.checkId, "Check", { max: 40, required: true });
    if (v.flag(req.body.checked)) {
      db.prepare(
        `INSERT INTO shift_checks (restaurant_id, log_date, check_id, checked_at, checked_by) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (restaurant_id, log_date, check_id) DO UPDATE SET checked_at = excluded.checked_at, checked_by = excluded.checked_by`
      ).run(req.auth.restaurantId, date, checkId, v.time(req.body.at, "Time"), req.auth.userId);
    } else {
      db.prepare("DELETE FROM shift_checks WHERE restaurant_id = ? AND log_date = ? AND check_id = ?").run(req.auth.restaurantId, date, checkId);
    }
    res.status(204).end();
  });

  /* ---------- Cooling ---------- */

  const step = (r, label) => (r ? { v: v.number(r.v, `${label} reading`), at: v.time(r.at, `${label} time`) } : null);

  router.post("/days/:date/cooling", (req, res) => {
    const date = v.date(req.params.date, "Date", { required: true });
    const b = req.body;
    const batch = {
      id: crypto.randomUUID(),
      food: v.text(b.food, "Food", { max: 60, required: true }),
      start: v.time(b.start, "Start time"),
      t0: v.number(b.t0, "Start temperature"),
      by: v.text(b.by, "Initials", { max: 4, required: true }).toUpperCase(),
      // Accepted so an undo can restore a batch exactly.
      r2: step(b.r2, "2-hour"),
      r6: step(b.r6, "6-hour"),
    };
    db.prepare(
      `INSERT INTO cooling_batches (id, restaurant_id, log_date, food, start_time, start_temp, initials, check2_temp, check2_at, check6_temp, check6_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      batch.id, req.auth.restaurantId, date, batch.food, batch.start, batch.t0, batch.by,
      batch.r2 ? batch.r2.v : null, batch.r2 ? batch.r2.at : null,
      batch.r6 ? batch.r6.v : null, batch.r6 ? batch.r6.at : null,
      req.auth.userId
    );
    res.status(201).json(batch);
  });

  router.patch("/cooling/:id", (req, res) => {
    const which = v.oneOf(Number(req.body.step), "Step", [2, 6]);
    const value = v.number(req.body.v, "Reading");
    const at = v.time(req.body.at, "Time");
    const result = db
      .prepare(`UPDATE cooling_batches SET check${which}_temp = ?, check${which}_at = ? WHERE id = ? AND restaurant_id = ?`)
      .run(value, at, req.params.id, req.auth.restaurantId);
    if (!result.changes) throw notFound();
    res.json(toCooling(db.prepare("SELECT * FROM cooling_batches WHERE id = ?").get(req.params.id)));
  });

  router.delete("/cooling/:id", (req, res) => {
    db.prepare("DELETE FROM cooling_batches WHERE id = ? AND restaurant_id = ?").run(req.params.id, req.auth.restaurantId);
    res.status(204).end();
  });

  /* ---------- Export: recent days that have entries, newest first ---------- */

  router.get("/logs", (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 120, 1), 1000);
    const dates = db
      .prepare(
        `SELECT log_date FROM readings WHERE restaurant_id = ?1
         UNION SELECT log_date FROM cooling_batches WHERE restaurant_id = ?1
         ORDER BY log_date DESC LIMIT ?2`
      )
      .all(req.auth.restaurantId, limit)
      .map((r) => r.log_date);
    res.json(dates.map((date) => readDay(req.auth.restaurantId, date)));
  });

  return router;
};
