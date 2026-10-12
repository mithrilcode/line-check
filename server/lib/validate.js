"use strict";

/** An error with an HTTP status; the error handler sends `message` to the client. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const bad = (message) => new HttpError(400, message);

/**
 * Small validators for request bodies. Each returns the cleaned value or throws a 400.
 * `label` is the human name used in error messages.
 */
const v = {
  text(value, label, { max = 200, required = false } = {}) {
    if (value == null || value === "") {
      if (required) throw bad(`${label} is required.`);
      return "";
    }
    if (typeof value !== "string") throw bad(`${label} must be text.`);
    const s = value.trim();
    if (required && !s) throw bad(`${label} is required.`);
    if (s.length > max) throw bad(`${label} must be ${max} characters or fewer.`);
    return s;
  },

  date(value, label, { required = false } = {}) {
    if (value == null || value === "") {
      if (required) throw bad(`${label} is required.`);
      return null;
    }
    if (typeof value !== "string" || !DATE.test(value) || Number.isNaN(Date.parse(value))) {
      throw bad(`${label} must be a date (YYYY-MM-DD).`);
    }
    return value;
  },

  time(value, label) {
    if (typeof value !== "string" || !TIME.test(value)) throw bad(`${label} must be a time (HH:MM).`);
    return value;
  },

  number(value, label, { min = -1e6, max = 1e6 } = {}) {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n)) throw bad(`${label} must be a number.`);
    if (n < min || n > max) throw bad(`${label} is out of range.`);
    return n;
  },

  integer(value, label, opts) {
    const n = v.number(value, label, opts);
    if (!Number.isInteger(n)) throw bad(`${label} must be a whole number.`);
    return n;
  },

  /** SQLite has no boolean type: returns 1 or 0. */
  flag(value) {
    return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
  },

  oneOf(value, label, options) {
    if (!options.includes(value)) throw bad(`${label} must be one of: ${options.join(", ")}.`);
    return value;
  },

  email(value) {
    const s = v.text(value, "Email", { max: 254, required: true }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad("Enter a valid email address.");
    return s;
  },

  password(value) {
    if (typeof value !== "string" || value.length < 10) throw bad("Password must be at least 10 characters.");
    if (value.length > 200) throw bad("Password must be 200 characters or fewer.");
    return value;
  },

  object(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw bad(`${label} is missing.`);
    return value;
  },
};

module.exports = { HttpError, v };
