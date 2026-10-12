"use strict";

/**
 * Test harness: starts the app on a random port with a throwaway database and
 * a mailer that captures messages, and provides a cookie-keeping HTTP client.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase } = require("../server/db");
const { createApp } = require("../server/app");

const APP_URL = "http://line-check.test";

async function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "linecheck-test-"));
  const db = openDatabase(dataDir);
  const outbox = [];
  const mailer = {
    configured: false,
    async send(message) {
      outbox.push(message);
      return { delivered: false };
    },
  };
  const server = createApp({ db, dataDir, mailer, appUrl: APP_URL }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    db,
    dataDir,
    baseUrl,
    mailer,
    outbox,
    /** The newest email sent to `to`, if any. */
    lastEmailTo: (to) => [...outbox].reverse().find((m) => m.to === to),
    client: () => createClient(baseUrl),
    stop() {
      server.close();
      db.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** A tiny client that keeps its own session cookie. */
function createClient(baseUrl) {
  let cookie = "";
  async function call(method, url, body, headers = {}) {
    const opts = { method, headers: { "X-Requested-With": "fetch", ...headers }, redirect: "manual" };
    if (cookie) opts.headers.Cookie = cookie;
    if (body !== undefined) {
      if (Buffer.isBuffer(body)) opts.body = body;
      else {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(baseUrl + url, opts);
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (u) => call("GET", u),
    post: (u, b, h) => call("POST", u, b, h),
    put: (u, b) => call("PUT", u, b),
    patch: (u, b) => call("PATCH", u, b),
    del: (u) => call("DELETE", u),
  };
}

const signupBody = (email, state = "TX", password = "correct horse battery") => ({
  state,
  user: { name: "Dana Owner", title: "Owner", email, password },
  restaurant: { name: "Test Kitchen", city: "Austin", county: "Travis", servesAlcohol: true },
});

/** Pulls the token out of an emailed link. */
const linkToken = (text) => text.match(/token=([A-Za-z0-9_-]+)/)[1];

module.exports = { startServer, signupBody, linkToken, APP_URL };
