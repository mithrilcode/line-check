"use strict";

/**
 * End-to-end API tests. Each run starts the app on a random port with a
 * throwaway database and talks to it over HTTP like the browser does.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase } = require("../server/db");
const { createApp } = require("../server/app");

let server;
let baseUrl;
let db;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "linecheck-test-"));
  db = openDatabase(dataDir);
  server = createApp({ db, dataDir }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** A tiny client that keeps its own session cookie. */
function client() {
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
    raw: call,
  };
}

const signupBody = (email, state = "TX") => ({
  state,
  user: { name: "Dana Owner", title: "Owner", email, password: "correct horse battery" },
  restaurant: { name: "Test Kitchen", city: "Austin", county: "Travis", servesAlcohol: true },
});

let owner;

test("sign-up creates an account, restaurant, default units and a session", async () => {
  owner = client();
  const res = await owner.post("/api/auth/signup", signupBody("owner@example.com"));
  assert.equal(res.status, 201);

  const me = await owner.get("/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.data.role, "owner");
  assert.equal(me.data.restaurant.state, "TX");
  assert.equal(me.data.restaurant.servesAlcohol, true);
  assert.equal(me.data.user.email, "owner@example.com");

  const units = await owner.get("/api/units");
  assert.equal(units.data.length, 4);
});

test("sign-up validates input and rejects duplicate emails", async () => {
  const c = client();
  const short = await c.post("/api/auth/signup", { ...signupBody("x@example.com"), user: { name: "X", email: "x@example.com", password: "short" } });
  assert.equal(short.status, 400);
  assert.match(short.data.error, /at least 10/);

  const badState = await c.post("/api/auth/signup", { ...signupBody("y@example.com"), state: "NV" });
  assert.equal(badState.status, 400);

  const dup = await c.post("/api/auth/signup", signupBody("OWNER@example.com"));
  assert.equal(dup.status, 409);
});

test("login, logout and protected routes", async () => {
  const c = client();
  assert.equal((await c.get("/api/deadlines")).status, 401);
  assert.equal((await c.post("/api/auth/login", { email: "owner@example.com", password: "wrong password!" })).status, 401);
  assert.equal((await c.post("/api/auth/login", { email: "owner@example.com", password: "correct horse battery" })).status, 200);
  assert.equal((await c.get("/api/deadlines")).status, 200);
  await c.post("/api/auth/logout", {});
  assert.equal((await c.get("/api/deadlines")).status, 401);
});

test("the dashboard page redirects to login without a session", async () => {
  const res = await client().get("/app.html");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/login.html");
  const landing = await client().get("/");
  assert.equal(landing.status, 200);
});

test("state-changing requests need the fetch header (CSRF guard)", async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@example.com", password: "correct horse battery" }),
  });
  assert.equal(res.status, 403);
});

test("daily log: readings, shift checks, cooling and export", async () => {
  const date = "2026-10-12";
  const failing = await owner.post(`/api/days/${date}/readings`, { at: "07:30", key: "u:x", what: "Walk-in cooler", value: 45, unit: "°F", ok: false, by: "ab" });
  assert.equal(failing.status, 400, "out-of-range reading needs a corrective action");

  const reading = await owner.post(`/api/days/${date}/readings`, {
    at: "07:30", key: "u:x", what: "Walk-in cooler", value: 45, unit: "°F", ok: false, by: "ab", action: "Moved food",
  });
  assert.equal(reading.status, 201);
  assert.equal(reading.data.by, "AB");

  await owner.put(`/api/days/${date}/checks/soap`, { checked: true, at: "06:55" });
  const cool = await owner.post(`/api/days/${date}/cooling`, { food: "Stock", start: "14:00", t0: 160, by: "cd" });
  assert.equal(cool.status, 201);
  const logged = await owner.patch(`/api/cooling/${cool.data.id}`, { step: 2, v: 68, at: "15:50" });
  assert.deepEqual(logged.data.r2, { v: 68, at: "15:50" });

  const day = await owner.get(`/api/days/${date}`);
  assert.equal(day.data.temps.length, 1);
  assert.equal(day.data.temps[0].ok, false);
  assert.equal(day.data.checks.soap, "06:55");
  assert.equal(day.data.cooling[0].r2.v, 68);

  await owner.put(`/api/days/${date}/checks/soap`, { checked: false });
  assert.equal((await owner.get(`/api/days/${date}`)).data.checks.soap, undefined);

  const logs = await owner.get("/api/logs");
  assert.equal(logs.data.length, 1);
  assert.equal(logs.data[0].date, date);

  await owner.del(`/api/readings/${reading.data.id}`);
  assert.equal((await owner.get(`/api/days/${date}`)).data.temps.length, 0);
});

test("deadlines: create, bulk, update, delete", async () => {
  const created = await owner.post("/api/deadlines", { name: "Health permit", cat: "permit", cycle: 12, due: "2027-03-31" });
  assert.equal(created.status, 201);
  const bulk = await owner.post("/api/deadlines/bulk", { items: [{ name: "Pest control", cat: "service", cycle: 1 }, { name: "Hood cleaning", cat: "fire", cycle: 6 }] });
  assert.equal(bulk.data.length, 2);

  const updated = await owner.put(`/api/deadlines/${created.data.id}`, { ...created.data, due: "2028-03-31", lastDone: "2026-10-12" });
  assert.equal(updated.data.due, "2028-03-31");

  assert.equal((await owner.get("/api/deadlines")).data.length, 3);
  await owner.del(`/api/deadlines/${created.data.id}`);
  assert.equal((await owner.get("/api/deadlines")).data.length, 2);

  const bad = await owner.post("/api/deadlines", { name: "X", cat: "nonsense" });
  assert.equal(bad.status, 400);
});

test("inspection walkthrough ticks and reset", async () => {
  const ticked = await owner.put("/api/inspection/ticks/t1", { checked: true, date: "2026-10-12" });
  assert.equal(ticked.data.ticks.t1, "2026-10-12");
  assert.equal(ticked.data.started, "2026-10-12");
  const reset = await owner.post("/api/inspection/reset", { date: "2026-10-13" });
  assert.deepEqual(reset.data.ticks, {});
  assert.equal(reset.data.started, "2026-10-13");
});

let employeeId;
let fileId;

test("employee files: profile, certification with upload, records, onboarding, documents", async () => {
  const created = await owner.post("/api/employees", { name: "Sam Cook", role: "Line cook", hireDate: "2026-10-01", alcohol: true });
  assert.equal(created.status, 201);
  employeeId = created.data.id;
  assert.equal(created.data.status, "active");

  const upload = await owner.post("/api/files", Buffer.from("%PDF-1.4 test"), { "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent("card scan.pdf") });
  assert.equal(upload.status, 201);
  fileId = upload.data.id;

  const svg = await owner.post("/api/files", Buffer.from("<svg/>"), { "Content-Type": "image/svg+xml" });
  assert.equal(svg.status, 415, "SVG uploads are refused");

  const withCert = await owner.post(`/api/employees/${employeeId}/certs`, { type: "fh", issued: "2026-10-05", expires: "2028-10-05", fileId });
  assert.equal(withCert.data.certs[0].fileName, "card scan.pdf");

  const download = await owner.get(`/api/files/${fileId}`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/pdf");

  const withRecord = await owner.post(`/api/employees/${employeeId}/records`, { date: "2026-10-10", type: "written", summary: "Late twice", ack: true });
  const record = withRecord.data.records[0];
  assert.ok(record.ack);

  const onboarded = await owner.put(`/api/employees/${employeeId}/onboarding/i9`, { done: true, date: "2026-10-02" });
  assert.equal(onboarded.data.onboard.i9, "2026-10-02");

  const doc = await owner.post("/api/files", Buffer.from([0xff, 0xd8, 0xff]), { "Content-Type": "image/jpeg", "X-File-Name": "i9.jpg" });
  const withDoc = await owner.post(`/api/employees/${employeeId}/documents`, { label: "Signed I-9", fileId: doc.data.id });
  assert.equal(withDoc.data.docs.length, 1);

  const former = await owner.patch(`/api/employees/${employeeId}`, { status: "former", endDate: "2026-12-01" });
  assert.equal(former.data.status, "former");

  const removed = await owner.del(`/api/employees/${employeeId}/records/${record.id}`);
  assert.equal(removed.data.records.length, 0);
});

test("restaurants can't see each other's data", async () => {
  const other = client();
  await other.post("/api/auth/signup", signupBody("other@example.com", "CA"));
  assert.equal((await other.get("/api/employees")).data.length, 0);
  assert.equal((await other.get(`/api/files/${fileId}`)).status, 404);
  assert.equal((await other.patch(`/api/employees/${employeeId}`, { name: "Hacked" })).status, 404);
  assert.equal((await other.get("/api/deadlines")).data.length, 0);
  const attach = await other.post("/api/employees", { name: "Pat" });
  const steal = await other.post(`/api/employees/${attach.data.id}/documents`, { label: "x", fileId });
  assert.equal(steal.status, 400, "can't attach another restaurant's file");
});

test("deleting an employee removes their files", async () => {
  await owner.del(`/api/employees/${employeeId}`);
  assert.equal((await owner.get(`/api/files/${fileId}`)).status, 404);
  assert.equal(fs.existsSync(path.join(dataDir, "uploads", fileId)), false);
});

test("staff members can't open employee files", async () => {
  const restaurantId = db.prepare("SELECT restaurant_id FROM memberships LIMIT 1").get().restaurant_id;
  const staff = client();
  await staff.post("/api/auth/signup", signupBody("staff@example.com"));
  const staffId = db.prepare("SELECT id FROM users WHERE email = ?").get("staff@example.com").id;
  db.prepare("INSERT INTO memberships (user_id, restaurant_id, role) VALUES (?, ?, 'staff')").run(staffId, restaurantId);
  db.prepare("UPDATE sessions SET restaurant_id = ? WHERE user_id = ?").run(restaurantId, staffId);
  assert.equal((await staff.get("/api/employees")).status, 403);
  assert.equal((await staff.get("/api/deadlines")).status, 200);
});
