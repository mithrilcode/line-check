"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { HttpError } = require("../lib/validate");
const { upcomingItems, addDays } = require("../lib/upcoming");
const { requireManager } = require("../auth");

/* ---------- iCalendar (RFC 5545) helpers ---------- */

const escapeText = (s) => String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const icsDate = (ymd) => ymd.replace(/-/g, "");

/** Folds lines longer than 75 octets, as the spec requires. */
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // don't split a UTF-8 character
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

function buildCalendar(restaurant, items) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Line Check//Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`${restaurant.name} deadlines`)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
  ];
  items.forEach((item) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.key.replace(/[^a-z0-9:-]/gi, "")}@line-check`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(item.due)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(item.due, 1))}`,
      `SUMMARY:${escapeText(`${item.title} due`)}`,
      `DESCRIPTION:${escapeText([item.detail, "Managed in Line Check"].filter(Boolean).join(". "))}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`${item.title} due in 7 days`)}`,
      "TRIGGER:-P7D",
      "END:VALARM",
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

const newToken = () => crypto.randomBytes(24).toString("base64url");

/** Feed URL management (behind login) and the public feed itself. */
module.exports = function calendarRoutes({ db, appUrl }) {
  const api = express.Router();
  const feedUrl = (token) => `${appUrl}/calendar/${token}.ics`;

  api.get("/calendar", requireManager, (req, res) => {
    let { calendar_token: token } = db.prepare("SELECT calendar_token FROM restaurants WHERE id = ?").get(req.auth.restaurantId);
    if (!token) {
      token = newToken();
      db.prepare("UPDATE restaurants SET calendar_token = ? WHERE id = ?").run(token, req.auth.restaurantId);
    }
    res.json({ url: feedUrl(token) });
  });

  /** Issues a new feed URL; the old one stops working. */
  api.post("/calendar/reset", requireManager, (req, res) => {
    const token = newToken();
    db.prepare("UPDATE restaurants SET calendar_token = ? WHERE id = ?").run(token, req.auth.restaurantId);
    res.json({ url: feedUrl(token) });
  });

  const feed = express.Router();
  feed.get("/calendar/:file", (req, res) => {
    const token = req.params.file.replace(/\.ics$/, "");
    const restaurant = token && db.prepare("SELECT * FROM restaurants WHERE calendar_token = ?").get(token);
    if (!restaurant) throw new HttpError(404, "Calendar not found.");
    res.set({ "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900" });
    res.send(buildCalendar(restaurant, upcomingItems(db, restaurant)));
  });

  return { api, feed };
};
