"use strict";

const express = require("express");
const { v } = require("../lib/validate");
const { toRestaurant } = require("../lib/mappers");
const { requireManager } = require("../auth");

/** Editable restaurant fields: API name → [column, validator]. */
const FIELDS = {
  name: ["name", (x) => v.text(x, "Restaurant name", { max: 100, required: true })],
  address: ["address", (x) => v.text(x, "Street address", { max: 120 })],
  city: ["city", (x) => v.text(x, "City", { max: 60 })],
  county: ["county", (x) => v.text(x, "County", { max: 60 })],
  zip: ["zip", (x) => v.text(x, "ZIP code", { max: 10 })],
  phone: ["phone", (x) => v.text(x, "Phone", { max: 30 })],
  permitNumber: ["permit_number", (x) => v.text(x, "Permit number", { max: 60 })],
  servesAlcohol: ["serves_alcohol", v.flag],
};

module.exports = function restaurantRoutes({ db }) {
  const router = express.Router();

  router.patch("/restaurant", requireManager, (req, res) => {
    const body = v.object(req.body, "Restaurant details");
    const updates = Object.keys(FIELDS)
      .filter((key) => key in body)
      .map((key) => [FIELDS[key][0], FIELDS[key][1](body[key])]);

    if (updates.length) {
      db.prepare(`UPDATE restaurants SET ${updates.map(([col]) => `${col} = ?`).join(", ")} WHERE id = ?`).run(
        ...updates.map(([, value]) => value),
        req.auth.restaurantId
      );
    }
    res.json(toRestaurant(db.prepare("SELECT * FROM restaurants WHERE id = ?").get(req.auth.restaurantId)));
  });

  return router;
};
