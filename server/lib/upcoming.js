"use strict";

/**
 * Everything with a date a restaurant needs to act on: deadlines, employee
 * certificate expirations and food handler cards not yet on file. Shared by
 * the reminder email and the calendar feed.
 */

const CERT_LABELS = {
  fh: "Food handler card",
  cfm: "Certified Food Manager",
  cfpm: "Food Protection Manager",
  tabc: "TABC seller-server",
  rbs: "RBS certification",
  allergen: "Allergen awareness",
};

/** Days after hire a new employee has to get a food handler card, by state. */
const HANDLER_DUE_DAYS = { CA: 30, TX: 60 };
/** Certificates that cover the food handler requirement, by state. */
const HANDLER_COVERED_BY = { CA: "cfpm", TX: "cfm" };

const toUtc = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / 864e5);
const addDays = (ymd, n) => new Date(toUtc(ymd) + n * 864e5).toISOString().slice(0, 10);

/**
 * @returns {{ key: string, title: string, due: string, kind: "deadline"|"certificate", detail: string }[]}
 */
function upcomingItems(db, restaurant) {
  const items = [];

  db.prepare("SELECT * FROM deadlines WHERE restaurant_id = ? AND done = 0 AND due_date IS NOT NULL")
    .all(restaurant.id)
    .forEach((d) => items.push({ key: `deadline:${d.id}`, title: d.name, due: d.due_date, kind: "deadline", detail: d.agency }));

  const employees = db.prepare("SELECT * FROM employees WHERE restaurant_id = ? AND status = 'active'").all(restaurant.id);
  const certs = db
    .prepare(
      `SELECT c.employee_id, c.type, c.title, MAX(c.expires_on) AS expires_on
       FROM employee_certifications c JOIN employees e ON e.id = c.employee_id
       WHERE e.restaurant_id = ? AND e.status = 'active' AND c.expires_on IS NOT NULL
       GROUP BY c.employee_id, c.type`
    )
    .all(restaurant.id);
  const byEmployee = new Map(employees.map((e) => [e.id, { employee: e, certs: {} }]));
  certs.forEach((c) => {
    const entry = byEmployee.get(c.employee_id);
    if (entry) entry.certs[c.type] = c;
  });

  const today = new Date().toISOString().slice(0, 10);
  byEmployee.forEach(({ employee, certs: held }) => {
    const coverType = HANDLER_COVERED_BY[restaurant.state];
    const coverValid = held[coverType] && held[coverType].expires_on >= today;
    Object.values(held).forEach((c) => {
      if (c.type === "fh" && coverValid) return; // a manager certificate covers it
      const label = c.type === "other" && c.title ? c.title : CERT_LABELS[c.type] || c.title || "Certificate";
      items.push({ key: `cert:${employee.id}:${c.type}`, title: `${label}: ${employee.name}`, due: c.expires_on, kind: "certificate", detail: "Expires" });
    });
    if (!held.fh && !held[coverType] && employee.hire_date) {
      items.push({
        key: `cert:${employee.id}:fh-needed`,
        title: `Food handler card needed: ${employee.name}`,
        due: addDays(employee.hire_date, HANDLER_DUE_DAYS[restaurant.state] || 30),
        kind: "certificate",
        detail: "Due after hire",
      });
    }
  });

  return items.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

module.exports = { upcomingItems, daysBetween, addDays };
