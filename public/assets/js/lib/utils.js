/**
 * Shared helpers: DOM access, HTML escaping, date math, local storage and toasts.
 * Exposed as LineCheck.utils.
 */
(function (LC) {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

  /* ---------- Dates (local time, ISO "YYYY-MM-DD" and "HH:MM" strings) ---------- */

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const todayStr = () => ymd(new Date());
  const nowHM = () => {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const daysUntil = (s) => Math.round((parseYmd(s) - parseYmd(todayStr())) / 864e5);

  /** Adds calendar months, clamping to the last day of a shorter month (Jan 31 + 1 → Feb 28). */
  function addMonths(s, months) {
    const d = parseYmd(s);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return ymd(d);
  }

  function addDays(s, days) {
    const d = parseYmd(s);
    d.setDate(d.getDate() + days);
    return ymd(d);
  }

  const fmtDate = (s) =>
    s ? parseYmd(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  const fmtShortDate = (s) => (s ? parseYmd(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

  function fmtHM(hm) {
    if (!hm) return "";
    const [h, m] = hm.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  /** Adds minutes to "HH:MM", reporting whether the result rolls past midnight. */
  function hmAdd(hm, minutes) {
    const [h, m] = hm.split(":").map(Number);
    let total = h * 60 + m + minutes;
    const nextDay = total >= 1440;
    total = ((total % 1440) + 1440) % 1440;
    return { hm: `${pad(Math.floor(total / 60))}:${pad(total % 60)}`, nextDay };
  }

  function minsSince(date, hm) {
    const [h, m] = hm.split(":").map(Number);
    const d = parseYmd(date);
    d.setHours(h, m, 0, 0);
    return (Date.now() - d.getTime()) / 6e4;
  }

  /* ---------- Misc ---------- */

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const initials = (name) =>
    String(name || "?")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  /* ---------- Local storage, namespaced per state so pages on one origin stay separate ---------- */

  const keyPrefix = () => `linecheck:${(LC.config && LC.config.id) || "app"}:`;
  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(keyPrefix() + key);
        return v ? JSON.parse(v) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(keyPrefix() + key, JSON.stringify(value));
      } catch {
        /* Storage blocked or full: the page keeps working in memory. */
      }
    },
    keys() {
      try {
        const p = keyPrefix();
        return Object.keys(localStorage)
          .filter((k) => k.startsWith(p))
          .map((k) => k.slice(p.length));
      } catch {
        return [];
      }
    },
  };

  /* ---------- Toasts & errors ---------- */

  let toastTimer = null;
  let undoFn = null;

  function toast(message, undo) {
    $("toast-t").textContent = message;
    undoFn = undo || null;
    $("toast-b").hidden = !undo;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      $("toast").hidden = true;
    }, undo ? 7000 : 3500);
  }

  function bindToast() {
    $("toast-b").addEventListener("click", () => {
      if (undoFn) undoFn();
      $("toast").hidden = true;
    });
  }

  function showError(e) {
    const code = e && e.code;
    if (code === "quota_exceeded") toast("Storage is full. Delete old deadlines or logs, then try again.");
    else if (code === "invalid_argument") toast("You have view-only access, so changes can't be saved.");
    else toast("Couldn't save. Check your connection and try again.");
  }

  /** Re-renders a region without losing what the user is typing in its fields. */
  function keepInputs(el, render) {
    const saved = {};
    el.querySelectorAll("input, textarea, select").forEach((i) => {
      if (i.id && i.type !== "file" && i.type !== "checkbox") saved[i.id] = i.value;
    });
    const focused = document.activeElement && document.activeElement.id;
    render();
    Object.keys(saved).forEach((id) => {
      const i = $(id);
      if (i && saved[id]) i.value = saved[id];
    });
    if (focused && $(focused)) $(focused).focus();
  }

  LC.utils = {
    $, esc, pad, ymd, parseYmd, todayStr, nowHM, daysUntil, addMonths, addDays,
    fmtDate, fmtShortDate, fmtHM, hmAdd, minsSince, uid, clone, plural, initials,
    storage, toast, bindToast, showError, keepInputs,
  };
})((window.LineCheck = window.LineCheck || {}));
