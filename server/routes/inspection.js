"use strict";

const express = require("express");
const { transaction } = require("../db");
const { v } = require("../lib/validate");

const today = () => new Date().toISOString().slice(0, 10);

module.exports = function inspectionRoutes({ db }) {
  const router = express.Router();

  function readWalkthrough(restaurantId) {
    const { walkthrough_started: started } = db.prepare("SELECT walkthrough_started FROM restaurants WHERE id = ?").get(restaurantId);
    const ticks = db.prepare("SELECT item_id, checked_on FROM inspection_ticks WHERE restaurant_id = ?").all(restaurantId);
    return { started: started || "", ticks: Object.fromEntries(ticks.map((t) => [t.item_id, t.checked_on])) };
  }

  router.get("/inspection", (req, res) => {
    res.json(readWalkthrough(req.auth.restaurantId));
  });

  router.put("/inspection/ticks/:itemId", (req, res) => {
    const itemId = v.text(req.params.itemId, "Item", { max: 40, required: true });
    const on = v.date(req.body.date, "Date") || today();
    transaction(db, () => {
      if (v.flag(req.body.checked)) {
        db.prepare(
          `INSERT INTO inspection_ticks (restaurant_id, item_id, checked_on) VALUES (?, ?, ?)
           ON CONFLICT (restaurant_id, item_id) DO UPDATE SET checked_on = excluded.checked_on`
        ).run(req.auth.restaurantId, itemId, on);
        db.prepare("UPDATE restaurants SET walkthrough_started = COALESCE(walkthrough_started, ?) WHERE id = ?").run(on, req.auth.restaurantId);
      } else {
        db.prepare("DELETE FROM inspection_ticks WHERE restaurant_id = ? AND item_id = ?").run(req.auth.restaurantId, itemId);
      }
    });
    res.json(readWalkthrough(req.auth.restaurantId));
  });

  /** Clears every tick and starts a new walkthrough today. */
  router.post("/inspection/reset", (req, res) => {
    const on = v.date(req.body.date, "Date") || today();
    transaction(db, () => {
      db.prepare("DELETE FROM inspection_ticks WHERE restaurant_id = ?").run(req.auth.restaurantId);
      db.prepare("UPDATE restaurants SET walkthrough_started = ? WHERE id = ?").run(on, req.auth.restaurantId);
    });
    res.json(readWalkthrough(req.auth.restaurantId));
  });

  return router;
};
