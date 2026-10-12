"use strict";

/** Team invitations, account settings, password reset, the calendar feed and reminder emails. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, signupBody, linkToken, APP_URL } = require("./helpers");
const { runReminders } = require("../server/reminders");

let app;
let owner;

before(async () => {
  app = await startServer();
  owner = app.client();
  await owner.post("/api/auth/signup", signupBody("owner@example.com"));
});

after(() => app.stop());

/* ---------- Team invitations ---------- */

test("owner invites a new person, who creates an account by accepting", async () => {
  const invite = await owner.post("/api/team/invites", { email: "new.cook@example.com", role: "staff" });
  assert.equal(invite.status, 201);
  assert.ok(invite.data.link.startsWith(`${APP_URL}/invite.html?token=`));
  const email = app.lastEmailTo("new.cook@example.com");
  assert.ok(email, "invite email sent");
  const token = linkToken(email.text);

  const preview = await app.client().get(`/api/invites/${token}`);
  assert.equal(preview.data.restaurantName, "Test Kitchen");
  assert.equal(preview.data.hasAccount, false);

  const invitee = app.client();
  const weak = await invitee.post(`/api/invites/${token}/accept`, { name: "New Cook", password: "short" });
  assert.equal(weak.status, 400);
  const accepted = await invitee.post(`/api/invites/${token}/accept`, { name: "New Cook", password: "line cook password" });
  assert.equal(accepted.status, 200);
  const me = await invitee.get("/api/auth/me");
  assert.equal(me.data.role, "staff");
  assert.equal(me.data.restaurant.name, "Test Kitchen");

  const reuse = await app.client().post(`/api/invites/${token}/accept`, { name: "X", password: "line cook password" });
  assert.equal(reuse.status, 404, "links are single use");

  const team = await owner.get("/api/team");
  assert.ok(team.data.members.some((m) => m.email === "new.cook@example.com" && m.role === "staff"));
  assert.equal(team.data.invites.length, 0);
});

test("an existing account accepts with its password and can switch restaurants", async () => {
  const other = app.client();
  await other.post("/api/auth/signup", signupBody("chef@example.com", "CA"));
  await owner.post("/api/team/invites", { email: "chef@example.com", role: "manager" });
  const token = linkToken(app.lastEmailTo("chef@example.com").text);

  const preview = await app.client().get(`/api/invites/${token}`);
  assert.equal(preview.data.hasAccount, true);
  const wrong = await app.client().post(`/api/invites/${token}/accept`, { password: "not the password" });
  assert.equal(wrong.status, 401);

  const chef = app.client();
  assert.equal((await chef.post(`/api/invites/${token}/accept`, { password: "correct horse battery" })).status, 200);
  const me = await chef.get("/api/auth/me");
  assert.equal(me.data.role, "manager");
  assert.equal(me.data.restaurants.length, 2);

  const own = me.data.restaurants.find((r) => r.role === "owner");
  assert.equal((await chef.post("/api/auth/switch", { restaurantId: own.id })).status, 200);
  assert.equal((await chef.get("/api/auth/me")).data.restaurant.state, "CA");
  assert.equal((await chef.post("/api/auth/switch", { restaurantId: "not-mine" })).status, 403);
});

test("role rules for team management", async () => {
  const team = await owner.get("/api/team");
  const cook = team.data.members.find((m) => m.email === "new.cook@example.com");
  const chef = team.data.members.find((m) => m.email === "chef@example.com");
  const ownerId = team.data.members.find((m) => m.role === "owner").userId;

  const manager = app.client();
  await manager.post("/api/auth/login", { email: "chef@example.com", password: "correct horse battery" });
  const kitchen = (await manager.get("/api/auth/me")).data.restaurants.find((r) => r.role === "manager");
  await manager.post("/api/auth/switch", { restaurantId: kitchen.id });

  assert.equal((await manager.post("/api/team/invites", { email: "m2@example.com", role: "manager" })).status, 403, "managers can't invite managers");
  assert.equal((await manager.post("/api/team/invites", { email: "s2@example.com", role: "staff" })).status, 201);
  assert.equal((await manager.patch(`/api/team/members/${cook.userId}`, { role: "manager" })).status, 403, "only the owner changes roles");
  assert.equal((await owner.del(`/api/team/members/${ownerId}`)).status, 403, "the owner can't be removed");

  assert.equal((await owner.patch(`/api/team/members/${cook.userId}`, { role: "manager" })).status, 204);
  assert.equal((await owner.patch(`/api/team/members/${cook.userId}`, { role: "staff" })).status, 204);
  assert.equal((await manager.del(`/api/team/members/${chef.userId}`)).status, 403, "managers can't remove managers");

  const cookClient = app.client();
  await cookClient.post("/api/auth/login", { email: "new.cook@example.com", password: "line cook password" });
  assert.equal((await cookClient.get("/api/team")).status, 403, "staff can't manage the team");
  assert.equal((await manager.del(`/api/team/members/${cook.userId}`)).status, 204, "managers can remove staff");
  assert.equal((await cookClient.get("/api/deadlines")).status, 401, "a removed person is signed out");

  const pending = (await owner.get("/api/team")).data.invites.find((i) => i.email === "s2@example.com");
  assert.ok((await owner.post(`/api/team/invites/${pending.id}/resend`)).data.link);
  assert.equal((await owner.del(`/api/team/invites/${pending.id}`)).status, 204);
  assert.equal((await owner.get("/api/team")).data.invites.length, 0);
});

/* ---------- Account & password ---------- */

test("password reset by email", async () => {
  const anon = app.client();
  const unknown = await anon.post("/api/auth/forgot", { email: "nobody@example.com" });
  assert.equal(unknown.status, 200, "same answer for unknown emails");
  assert.equal(app.lastEmailTo("nobody@example.com"), undefined);

  await anon.post("/api/auth/forgot", { email: "owner@example.com" });
  const token = linkToken(app.lastEmailTo("owner@example.com").text);
  assert.equal((await anon.post("/api/auth/reset", { token: "nope", password: "a brand new password" })).status, 400);

  assert.equal((await anon.post("/api/auth/reset", { token, password: "a brand new password" })).status, 200);
  assert.equal((await anon.get("/api/auth/me")).status, 200, "signed in after reset");
  assert.equal((await owner.get("/api/auth/me")).status, 401, "other sessions are signed out");
  assert.equal((await anon.post("/api/auth/reset", { token, password: "another new password" })).status, 400, "links are single use");
  assert.equal((await app.client().post("/api/auth/login", { email: "owner@example.com", password: "a brand new password" })).status, 200);

  owner = anon;
});

test("account changes: profile, reminder preference, password", async () => {
  const updated = await owner.patch("/api/account", { name: "Dana Q. Owner", emailReminders: false });
  assert.equal(updated.data.name, "Dana Q. Owner");
  assert.equal(updated.data.emailReminders, false);
  assert.equal((await owner.get("/api/auth/me")).data.user.emailReminders, false);

  const other = app.client();
  await other.post("/api/auth/login", { email: "owner@example.com", password: "a brand new password" });

  assert.equal((await owner.post("/api/account/password", { current: "wrong password!!", next: "yet another password" })).status, 400);
  assert.equal((await owner.post("/api/account/password", { current: "a brand new password", next: "yet another password" })).status, 200);
  assert.equal((await owner.get("/api/auth/me")).status, 200, "this session stays signed in");
  assert.equal((await other.get("/api/auth/me")).status, 401, "other sessions are signed out");
  await owner.patch("/api/account", { emailReminders: true });
});

/* ---------- Calendar feed & reminders ---------- */

test("calendar feed lists dated deadlines and can be reset", async () => {
  await owner.post("/api/deadlines", { name: "Hood cleaning; kitchen", cat: "fire", cycle: 6, due: "2026-11-01" });
  const { url } = (await owner.get("/api/calendar")).data;
  assert.match(url, /^http:\/\/line-check\.test\/calendar\/[\w-]+\.ics$/);
  const feedPath = new URL(url).pathname;

  const feed = await fetch(app.baseUrl + feedPath);
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get("content-type"), /text\/calendar/);
  const ics = await feed.text();
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:Hood cleaning\\; kitchen due/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261101/);
  assert.ok(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75), "lines are folded");

  const fresh = (await owner.post("/api/calendar/reset")).data.url;
  assert.notEqual(fresh, url);
  assert.equal((await fetch(app.baseUrl + feedPath)).status, 404, "the old URL stops working");
});

test("daily reminders email owners and managers once per day", async () => {
  const opts = { db: app.db, mailer: app.mailer, appUrl: APP_URL };
  app.outbox.length = 0;

  // The 2026-11-01 deadline from the previous test is 7 days after 2026-10-25.
  assert.ok((await runReminders({ ...opts, today: "2026-10-25" })) >= 1);
  const digest = app.lastEmailTo("owner@example.com");
  assert.ok(digest, "owner gets the digest");
  assert.match(digest.text, /Hood cleaning; kitchen — due in 7 days/);
  assert.ok(app.lastEmailTo("chef@example.com"), "managers get it too");

  assert.equal(await runReminders({ ...opts, today: "2026-10-25" }), 0, "no second email the same day");
  assert.equal(await runReminders({ ...opts, today: "2026-10-26" }), 0, "nothing on days without a trigger");

  await owner.patch("/api/account", { emailReminders: false });
  app.outbox.length = 0;
  await runReminders({ ...opts, today: "2026-10-31" });
  assert.equal(app.lastEmailTo("owner@example.com"), undefined, "opted-out users get nothing");
  assert.ok(app.lastEmailTo("chef@example.com"));
});
