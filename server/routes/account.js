"use strict";

const express = require("express");
const { HttpError, v } = require("../lib/validate");
const auth = require("../auth");

/** The signed-in user's own profile, password and notification settings. */
module.exports = function accountRoutes({ db }) {
  const router = express.Router();

  const FIELDS = {
    name: ["name", (x) => v.text(x, "Name", { max: 80, required: true })],
    title: ["title", (x) => v.text(x, "Role", { max: 60 })],
    phone: ["phone", (x) => v.text(x, "Phone", { max: 30 })],
    emailReminders: ["email_reminders", v.flag],
  };

  router.patch("/account", (req, res) => {
    const body = v.object(req.body, "Account details");
    const updates = Object.entries(FIELDS)
      .filter(([key]) => key in body)
      .map(([key, [col, check]]) => [col, check(body[key])]);
    if (updates.length) {
      db.prepare(`UPDATE users SET ${updates.map(([c]) => `${c} = ?`).join(", ")} WHERE id = ?`).run(
        ...updates.map(([, value]) => value),
        req.auth.userId
      );
    }
    const u = db.prepare("SELECT id, name, email, title, phone, email_reminders FROM users WHERE id = ?").get(req.auth.userId);
    res.json({ id: u.id, name: u.name, email: u.email, title: u.title, phone: u.phone, emailReminders: u.email_reminders === 1 });
  });

  /** Changes the password and signs out every other session. */
  router.post("/account/password", async (req, res) => {
    const body = v.object(req.body, "Password details");
    const current = typeof body.current === "string" ? body.current : "";
    const next = v.password(body.next);
    const { password_hash: stored } = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.auth.userId);
    if (!(await auth.verifyPassword(current, stored))) throw new HttpError(400, "Your current password isn't right.");

    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await auth.hashPassword(next), req.auth.userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(req.auth.userId, req.auth.tokenHash);
    res.json({ ok: true });
  });

  return router;
};
