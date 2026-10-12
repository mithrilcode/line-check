"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { transaction } = require("../db");
const { HttpError, v } = require("../lib/validate");
const { toDeadline } = require("../lib/mappers");

const CATEGORIES = ["permit", "cert", "fire", "service", "labor"];

function parseDeadline(b) {
  return {
    name: v.text(b.name, "Name", { max: 80, required: true }),
    cat: v.oneOf(b.cat, "Category", CATEGORIES),
    cycle: v.integer(b.cycle ?? 0, "Repeat interval", { min: 0, max: 120 }),
    agency: v.text(b.agency, "Agency", { max: 80 }),
    due: v.date(b.due, "Due date"),
    lastDone: v.date(b.lastDone, "Last done"),
    notes: v.text(b.notes, "Notes", { max: 500 }),
    done: v.flag(b.done),
  };
}

module.exports = function deadlineRoutes({ db }) {
  const router = express.Router();

  const insert = db.prepare(
    `INSERT INTO deadlines (id, restaurant_id, name, category, cycle_months, agency, due_date, last_done, notes, done)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const create = (restaurantId, d) => {
    const id = crypto.randomUUID();
    insert.run(id, restaurantId, d.name, d.cat, d.cycle, d.agency, d.due, d.lastDone, d.notes, d.done);
    return id;
  };
  const read = (id) => toDeadline(db.prepare("SELECT * FROM deadlines WHERE id = ?").get(id));

  router.get("/deadlines", (req, res) => {
    const rows = db.prepare("SELECT * FROM deadlines WHERE restaurant_id = ? ORDER BY due_date IS NULL, due_date, name").all(req.auth.restaurantId);
    res.json(rows.map(toDeadline));
  });

  router.post("/deadlines", (req, res) => {
    res.status(201).json(read(create(req.auth.restaurantId, parseDeadline(req.body))));
  });

  /** Adds several deadlines at once (the state starter list). */
  router.post("/deadlines/bulk", (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : null;
    if (!items || !items.length || items.length > 50) throw new HttpError(400, "Send between 1 and 50 deadlines.");
    const parsed = items.map(parseDeadline);
    const ids = transaction(db, () => parsed.map((d) => create(req.auth.restaurantId, d)));
    res.status(201).json(ids.map(read));
  });

  router.put("/deadlines/:id", (req, res) => {
    const d = parseDeadline(req.body);
    const result = db
      .prepare(
        `UPDATE deadlines SET name = ?, category = ?, cycle_months = ?, agency = ?, due_date = ?, last_done = ?, notes = ?, done = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND restaurant_id = ?`
      )
      .run(d.name, d.cat, d.cycle, d.agency, d.due, d.lastDone, d.notes, d.done, req.params.id, req.auth.restaurantId);
    if (!result.changes) throw new HttpError(404, "That deadline no longer exists.");
    res.json(read(req.params.id));
  });

  router.delete("/deadlines/:id", (req, res) => {
    db.prepare("DELETE FROM deadlines WHERE id = ? AND restaurant_id = ?").run(req.params.id, req.auth.restaurantId);
    res.status(204).end();
  });

  return router;
};
