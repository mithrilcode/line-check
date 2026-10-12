"use strict";

const { upcomingItems, daysBetween } = require("./lib/upcoming");

/**
 * Daily reminder email. An item is included on the days it is 30 days out,
 * 7 days out, 1 day out and due, and every 7th day while it is overdue.
 * Each restaurant gets at most one run per day; owners and managers who
 * haven't turned reminders off receive it.
 */

const REMIND_AT = new Set([30, 7, 1, 0]);

function shouldRemind(daysLeft) {
  return REMIND_AT.has(daysLeft) || (daysLeft < 0 && -daysLeft % 7 === 0);
}

function describe(daysLeft) {
  if (daysLeft === 0) return "due today";
  if (daysLeft === 1) return "due tomorrow";
  if (daysLeft > 1) return `due in ${daysLeft} days`;
  return `${-daysLeft} days overdue`;
}

function digestText({ restaurant, items, today, appUrl }) {
  const overdue = items.filter((i) => i.daysLeft < 0);
  const upcoming = items.filter((i) => i.daysLeft >= 0);
  const line = (i) => `  • ${i.title} — ${describe(i.daysLeft)} (${i.due})`;
  return [
    `Line Check reminders for ${restaurant.name}, ${today}`,
    "",
    ...(overdue.length ? ["OVERDUE", ...overdue.map(line), ""] : []),
    ...(upcoming.length ? ["COMING UP", ...upcoming.map(line), ""] : []),
    `Open your dashboard: ${appUrl}/app.html#deadlines`,
    "",
    `You get this email because you manage ${restaurant.name} in Line Check.`,
    `Turn reminder emails off under Settings: ${appUrl}/app.html#settings`,
  ].join("\n");
}

/**
 * Sends today's reminders for every restaurant that hasn't had them yet.
 * @param {{ db: any, mailer: any, appUrl: string, today?: string }} options  `today` is YYYY-MM-DD (UTC by default)
 * @returns {Promise<number>} emails sent
 */
async function runReminders({ db, mailer, appUrl, today = new Date().toISOString().slice(0, 10) }) {
  let sent = 0;
  const restaurants = db
    .prepare("SELECT r.* FROM restaurants r WHERE NOT EXISTS (SELECT 1 FROM reminder_runs x WHERE x.restaurant_id = r.id AND x.run_date = ?)")
    .all(today);

  for (const restaurant of restaurants) {
    const items = upcomingItems(db, restaurant)
      .map((i) => ({ ...i, daysLeft: daysBetween(today, i.due) }))
      .filter((i) => shouldRemind(i.daysLeft));

    // Claim the day first so two server processes can't both send it.
    const claimed = db
      .prepare("INSERT INTO reminder_runs (restaurant_id, run_date, items_sent) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
      .run(restaurant.id, today, items.length).changes;
    if (!claimed || !items.length) continue;

    const recipients = db
      .prepare(
        `SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.restaurant_id = ? AND m.role IN ('owner', 'manager') AND u.email_reminders = 1`
      )
      .all(restaurant.id);

    const overdue = items.filter((i) => i.daysLeft < 0).length;
    const subject = overdue
      ? `${restaurant.name}: ${overdue} overdue, ${items.length - overdue} coming up`
      : `${restaurant.name}: ${items.length} deadline${items.length === 1 ? "" : "s"} coming up`;
    const text = digestText({ restaurant, items, today, appUrl });

    for (const { email } of recipients) {
      try {
        await mailer.send({ to: email, subject, text });
        sent++;
      } catch (err) {
        console.error(`Reminder email to ${email} failed:`, err.message);
      }
    }
  }
  return sent;
}

module.exports = { runReminders, shouldRemind };
