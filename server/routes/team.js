"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { transaction } = require("../db");
const { HttpError, v } = require("../lib/validate");
const auth = require("../auth");

const INVITE_DAYS = 7;

/**
 * Team management (owners and managers) and the public invitation endpoints.
 *
 * Who can do what:
 *   owner   invites managers and staff, changes roles, removes anyone but themselves
 *   manager invites staff, removes staff
 */
module.exports = function teamRoutes({ db, secureCookies, mailer, appUrl }) {
  const now = () => new Date().toISOString();

  /* ---------- Shared ---------- */

  function issueInvite(invite, restaurant, inviterName) {
    const { token, hash } = auth.newToken();
    const expires = new Date(Date.now() + INVITE_DAYS * 864e5).toISOString();
    db.prepare("UPDATE invitations SET token_hash = ?, expires_at = ? WHERE id = ?").run(hash, expires, invite.id);
    const link = `${appUrl}/invite.html?token=${token}`;
    const roleName = invite.role === "manager" ? "a manager" : "a team member";
    const text = [
      `${inviterName} invited you to join ${restaurant.name} on Line Check as ${roleName}.`,
      "",
      "Line Check keeps the restaurant's temperature logs, permit renewals and inspection prep in one place.",
      "",
      `Accept the invitation: ${link}`,
      "",
      `The link expires in ${INVITE_DAYS} days.`,
    ].join("\n");
    return mailer
      .send({ to: invite.email, subject: `Join ${restaurant.name} on Line Check`, text })
      .then((r) => ({ link, emailed: r.delivered, expiresAt: expires }))
      .catch((err) => {
        console.error("Invite email failed:", err.message);
        return { link, emailed: false, expiresAt: expires };
      });
  }

  const pendingInvite = (token) =>
    db
      .prepare(
        `SELECT i.*, r.name AS restaurant_name, u.name AS inviter_name FROM invitations i
         JOIN restaurants r ON r.id = i.restaurant_id LEFT JOIN users u ON u.id = i.invited_by
         WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.expires_at > ?`
      )
      .get(auth.hashToken(String(token || "")), now());

  /* ---------- Team management (signed in, owner or manager) ---------- */

  const team = express.Router();
  team.use("/team", auth.requireManager);

  team.get("/team", (req, res) => {
    const members = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.title, m.role, m.created_at FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.restaurant_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.name`
      )
      .all(req.auth.restaurantId)
      .map((m) => ({ userId: m.id, name: m.name, email: m.email, title: m.title, role: m.role, isYou: m.id === req.auth.userId }));
    const invites = db
      .prepare(
        `SELECT i.id, i.email, i.role, i.expires_at, u.name AS invited_by FROM invitations i LEFT JOIN users u ON u.id = i.invited_by
         WHERE i.restaurant_id = ? AND i.accepted_at IS NULL ORDER BY i.created_at DESC`
      )
      .all(req.auth.restaurantId)
      .map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at, expired: i.expires_at <= now(), invitedBy: i.invited_by || "" }));
    res.json({ members, invites, emailConfigured: mailer.configured });
  });

  team.post("/team/invites", async (req, res) => {
    const email = v.email(req.body.email);
    const role = v.oneOf(req.body.role, "Role", ["manager", "staff"]);
    if (role === "manager" && req.auth.role !== "owner") throw new HttpError(403, "Only the owner can invite managers.");
    const member = db
      .prepare("SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.restaurant_id = ? AND u.email = ?")
      .get(req.auth.restaurantId, email);
    if (member) throw new HttpError(409, "That person is already on your team.");

    const restaurant = db.prepare("SELECT * FROM restaurants WHERE id = ?").get(req.auth.restaurantId);
    const invite = { id: crypto.randomUUID(), email, role };
    transaction(db, () => {
      // One open invitation per email: a new one replaces any earlier one.
      db.prepare("DELETE FROM invitations WHERE restaurant_id = ? AND email = ? AND accepted_at IS NULL").run(req.auth.restaurantId, email);
      db.prepare("INSERT INTO invitations (id, restaurant_id, email, role, token_hash, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        invite.id, req.auth.restaurantId, email, role, crypto.randomUUID(), req.auth.userId, now()
      );
    });
    const sent = await issueInvite(invite, restaurant, req.auth.user.name);
    res.status(201).json({ id: invite.id, email, role, ...sent });
  });

  /** Sends a fresh link (the old one stops working). */
  team.post("/team/invites/:id/resend", async (req, res) => {
    const invite = db
      .prepare("SELECT * FROM invitations WHERE id = ? AND restaurant_id = ? AND accepted_at IS NULL")
      .get(req.params.id, req.auth.restaurantId);
    if (!invite) throw new HttpError(404, "That invitation no longer exists.");
    if (invite.role === "manager" && req.auth.role !== "owner") throw new HttpError(403, "Only the owner can invite managers.");
    const restaurant = db.prepare("SELECT * FROM restaurants WHERE id = ?").get(req.auth.restaurantId);
    res.json({ id: invite.id, email: invite.email, role: invite.role, ...(await issueInvite(invite, restaurant, req.auth.user.name)) });
  });

  team.delete("/team/invites/:id", (req, res) => {
    db.prepare("DELETE FROM invitations WHERE id = ? AND restaurant_id = ? AND accepted_at IS NULL").run(req.params.id, req.auth.restaurantId);
    res.status(204).end();
  });

  function targetMember(req) {
    const row = db.prepare("SELECT role FROM memberships WHERE user_id = ? AND restaurant_id = ?").get(req.params.userId, req.auth.restaurantId);
    if (!row) throw new HttpError(404, "That person isn't on your team.");
    if (row.role === "owner") throw new HttpError(403, "The owner's access can't be changed.");
    return row;
  }

  team.patch("/team/members/:userId", (req, res) => {
    if (req.auth.role !== "owner") throw new HttpError(403, "Only the owner can change roles.");
    targetMember(req);
    const role = v.oneOf(req.body.role, "Role", ["manager", "staff"]);
    db.prepare("UPDATE memberships SET role = ? WHERE user_id = ? AND restaurant_id = ?").run(role, req.params.userId, req.auth.restaurantId);
    res.status(204).end();
  });

  team.delete("/team/members/:userId", (req, res) => {
    const target = targetMember(req);
    if (req.auth.role !== "owner" && target.role !== "staff") throw new HttpError(403, "Managers can only remove staff.");
    transaction(db, () => {
      db.prepare("DELETE FROM memberships WHERE user_id = ? AND restaurant_id = ?").run(req.params.userId, req.auth.restaurantId);
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND restaurant_id = ?").run(req.params.userId, req.auth.restaurantId);
    });
    res.status(204).end();
  });

  /* ---------- Invitations (public: the invitee may not have an account yet) ---------- */

  const invites = express.Router();

  invites.get("/invites/:token", (req, res) => {
    const invite = pendingInvite(req.params.token);
    if (!invite) throw new HttpError(404, "This invitation has expired, was already used, or was withdrawn. Ask for a new one.");
    const hasAccount = Boolean(db.prepare("SELECT 1 FROM users WHERE email = ?").get(invite.email));
    res.json({
      email: invite.email,
      role: invite.role,
      restaurantName: invite.restaurant_name,
      invitedBy: invite.inviter_name || "",
      hasAccount,
      signedInAs: req.auth ? req.auth.user.email : null,
    });
  });

  /**
   * Accepts an invitation. Three cases:
   *   signed in as the invited email → join
   *   the email has an account      → requires that account's password
   *   no account yet                → creates one from name + password
   */
  invites.post("/invites/:token/accept", async (req, res) => {
    const invite = pendingInvite(req.params.token);
    if (!invite) throw new HttpError(404, "This invitation has expired, was already used, or was withdrawn. Ask for a new one.");
    const body = req.body || {};
    let user = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(invite.email);

    if (req.auth && req.auth.user.email.toLowerCase() === invite.email.toLowerCase()) {
      // Already signed in as the right person.
    } else if (user) {
      const ok = await auth.verifyPassword(typeof body.password === "string" ? body.password : "", user.password_hash);
      if (!ok) throw new HttpError(401, `That isn't the password for ${invite.email}.`);
    } else {
      const name = v.text(body.name, "Your name", { max: 80, required: true });
      const passwordHash = await auth.hashPassword(v.password(body.password));
      user = { id: crypto.randomUUID() };
      db.prepare("INSERT INTO users (id, email, password_hash, name, title, phone) VALUES (?, ?, ?, ?, ?, ?)").run(
        user.id, invite.email, passwordHash, name, v.text(body.title, "Role", { max: 60 }), ""
      );
    }

    const userId = user ? user.id : req.auth.userId;
    transaction(db, () => {
      db.prepare(
        `INSERT INTO memberships (user_id, restaurant_id, role) VALUES (?, ?, ?)
         ON CONFLICT (user_id, restaurant_id) DO NOTHING`
      ).run(userId, invite.restaurant_id, invite.role);
      db.prepare("UPDATE invitations SET accepted_at = ? WHERE id = ?").run(now(), invite.id);
    });

    auth.endSession(db, req);
    auth.createSession(db, res, { userId, restaurantId: invite.restaurant_id, secure: secureCookies });
    res.json({ ok: true });
  });

  return { team, invites };
};
