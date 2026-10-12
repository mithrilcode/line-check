"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { transaction } = require("../db");
const { HttpError, v } = require("../lib/validate");
const { toEmployee, toCertification, toRecord, toDocument } = require("../lib/mappers");
const { requireManager } = require("../auth");
const { deleteFiles } = require("./files");

const RECORD_TYPES = ["verbal", "written", "final", "suspension", "illness", "injury", "training", "review", "commend", "note"];
const today = () => new Date().toISOString().slice(0, 10);

/** Profile fields: API name → [column, validator]. */
const PROFILE = {
  name: ["name", (x) => v.text(x, "Name", { max: 80, required: true })],
  role: ["position", (x) => v.text(x, "Position", { max: 60 })],
  hireDate: ["hire_date", (x) => v.date(x, "Hire date")],
  endDate: ["end_date", (x) => v.date(x, "Last day")],
  status: ["status", (x) => v.oneOf(x, "Status", ["active", "former"])],
  phone: ["phone", (x) => v.text(x, "Phone", { max: 30 })],
  email: ["email", (x) => v.text(x, "Email", { max: 120 })],
  emerg: ["emergency_contact", (x) => v.text(x, "Emergency contact", { max: 120 })],
  alcohol: ["serves_alcohol", v.flag],
  notes: ["notes", (x) => v.text(x, "Notes", { max: 1000 })],
};

module.exports = function employeeRoutes({ db, dataDir }) {
  const router = express.Router();
  router.use("/employees", requireManager);

  /** Loads the employee if it belongs to the signed-in restaurant, else 404. */
  function ownEmployee(req) {
    const row = db.prepare("SELECT id FROM employees WHERE id = ? AND restaurant_id = ?").get(req.params.id, req.auth.restaurantId);
    if (!row) throw new HttpError(404, "That employee file no longer exists.");
    return row.id;
  }

  /** A file id from the request, only if it was uploaded to this restaurant. */
  function ownFile(req, fileId) {
    if (!fileId) return null;
    const row = db.prepare("SELECT id FROM files WHERE id = ? AND restaurant_id = ?").get(fileId, req.auth.restaurantId);
    if (!row) throw new HttpError(400, "That attachment wasn't found. Upload it again.");
    return row.id;
  }

  /** Every employee with certifications, records, onboarding and documents nested. */
  function readAll(restaurantId, employeeId = null) {
    const filter = employeeId ? "AND e.id = ?2" : "";
    const params = employeeId ? [restaurantId, employeeId] : [restaurantId];
    const employees = db.prepare(`SELECT * FROM employees e WHERE e.restaurant_id = ?1 ${filter} ORDER BY e.name`).all(...params).map(toEmployee);
    const byId = new Map(employees.map((e) => [e.id, e]));

    const child = (sql) => db.prepare(sql.replace("{filter}", filter)).all(...params);
    child(`SELECT c.*, c.employee_id, f.original_name AS file_name FROM employee_certifications c
           JOIN employees e ON e.id = c.employee_id LEFT JOIN files f ON f.id = c.file_id
           WHERE e.restaurant_id = ?1 {filter} ORDER BY c.created_at`)
      .forEach((c) => byId.get(c.employee_id).certs.push(toCertification(c)));
    child(`SELECT r.*, f.original_name AS file_name FROM employee_records r
           JOIN employees e ON e.id = r.employee_id LEFT JOIN files f ON f.id = r.file_id
           WHERE e.restaurant_id = ?1 {filter} ORDER BY r.record_date, r.created_at`)
      .forEach((r) => byId.get(r.employee_id).records.push(toRecord(r)));
    child(`SELECT d.*, f.original_name AS file_name FROM employee_documents d
           JOIN employees e ON e.id = d.employee_id LEFT JOIN files f ON f.id = d.file_id
           WHERE e.restaurant_id = ?1 {filter} ORDER BY d.created_at`)
      .forEach((d) => byId.get(d.employee_id).docs.push(toDocument(d)));
    child(`SELECT o.* FROM employee_onboarding o JOIN employees e ON e.id = o.employee_id
           WHERE e.restaurant_id = ?1 {filter}`)
      .forEach((o) => (byId.get(o.employee_id).onboard[o.item_id] = o.completed_on));
    return employees;
  }

  const readOne = (req, id) => readAll(req.auth.restaurantId, id)[0];

  /* ---------- Employees ---------- */

  router.get("/employees", (req, res) => {
    res.json(readAll(req.auth.restaurantId));
  });

  router.post("/employees", (req, res) => {
    const b = v.object(req.body, "Employee details");
    const id = crypto.randomUUID();
    const values = Object.entries(PROFILE).map(([key, [col, check]]) => [col, key in b ? check(b[key]) : check(key === "status" ? "active" : undefined)]);
    db.prepare(
      `INSERT INTO employees (id, restaurant_id, ${values.map(([c]) => c).join(", ")}) VALUES (?, ?, ${values.map(() => "?").join(", ")})`
    ).run(id, req.auth.restaurantId, ...values.map(([, value]) => value));
    res.status(201).json(readOne(req, id));
  });

  router.patch("/employees/:id", (req, res) => {
    const id = ownEmployee(req);
    const b = v.object(req.body, "Employee details");
    const updates = Object.entries(PROFILE)
      .filter(([key]) => key in b)
      .map(([key, [col, check]]) => [col, check(b[key])]);
    if (updates.length) {
      db.prepare(
        `UPDATE employees SET ${updates.map(([c]) => `${c} = ?`).join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
      ).run(...updates.map(([, value]) => value), id);
    }
    res.json(readOne(req, id));
  });

  router.delete("/employees/:id", (req, res) => {
    const id = ownEmployee(req);
    const fileIds = db
      .prepare(
        `SELECT file_id FROM employee_certifications WHERE employee_id = ?1 AND file_id IS NOT NULL
         UNION SELECT file_id FROM employee_records WHERE employee_id = ?1 AND file_id IS NOT NULL
         UNION SELECT file_id FROM employee_documents WHERE employee_id = ?1`
      )
      .all(id)
      .map((r) => r.file_id);
    transaction(db, () => {
      db.prepare("DELETE FROM employees WHERE id = ?").run(id);
      deleteFiles(db, dataDir, fileIds);
    });
    res.status(204).end();
  });

  /* ---------- Certifications ---------- */

  router.post("/employees/:id/certs", (req, res) => {
    const id = ownEmployee(req);
    const b = req.body;
    db.prepare(
      `INSERT INTO employee_certifications (id, employee_id, type, title, number, provider, issued_on, expires_on, file_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(), id,
      v.text(b.type, "Certificate type", { max: 30, required: true }),
      v.text(b.title, "Certificate name", { max: 60 }),
      v.text(b.number, "Certificate number", { max: 40 }),
      v.text(b.provider, "Provider", { max: 60 }),
      v.date(b.issued, "Issue date"),
      v.date(b.expires, "Expiry date"),
      ownFile(req, b.fileId)
    );
    res.status(201).json(readOne(req, id));
  });

  /* ---------- Records ---------- */

  router.post("/employees/:id/records", (req, res) => {
    const id = ownEmployee(req);
    const b = req.body;
    db.prepare(
      `INSERT INTO employee_records (id, employee_id, record_date, type, summary, details, recorded_by, acknowledged_on, file_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(), id,
      v.date(b.date, "Date", { required: true }),
      v.oneOf(b.type, "Record type", RECORD_TYPES),
      v.text(b.summary, "Summary", { max: 120, required: true }),
      v.text(b.details, "Details", { max: 4000 }),
      v.text(b.by, "Recorded by", { max: 60 }),
      v.flag(b.ack) ? today() : null,
      ownFile(req, b.fileId)
    );
    res.status(201).json(readOne(req, id));
  });

  router.patch("/employees/:id/records/:recordId", (req, res) => {
    const id = ownEmployee(req);
    if (v.flag(req.body.ack)) {
      db.prepare("UPDATE employee_records SET acknowledged_on = COALESCE(acknowledged_on, ?) WHERE id = ? AND employee_id = ?").run(
        today(), req.params.recordId, id
      );
    }
    res.json(readOne(req, id));
  });

  /* ---------- Onboarding ---------- */

  router.put("/employees/:id/onboarding/:itemId", (req, res) => {
    const id = ownEmployee(req);
    const itemId = v.text(req.params.itemId, "Item", { max: 40, required: true });
    if (v.flag(req.body.done)) {
      db.prepare(
        `INSERT INTO employee_onboarding (employee_id, item_id, completed_on) VALUES (?, ?, ?)
         ON CONFLICT (employee_id, item_id) DO UPDATE SET completed_on = excluded.completed_on`
      ).run(id, itemId, v.date(req.body.date, "Date") || today());
    } else {
      db.prepare("DELETE FROM employee_onboarding WHERE employee_id = ? AND item_id = ?").run(id, itemId);
    }
    res.json(readOne(req, id));
  });

  /* ---------- Documents ---------- */

  router.post("/employees/:id/documents", (req, res) => {
    const id = ownEmployee(req);
    const fileId = ownFile(req, req.body.fileId);
    if (!fileId) throw new HttpError(400, "Choose a file to upload.");
    db.prepare("INSERT INTO employee_documents (id, employee_id, label, uploaded_on, file_id) VALUES (?, ?, ?, ?, ?)").run(
      crypto.randomUUID(), id, v.text(req.body.label, "Label", { max: 80, required: true }), today(), fileId
    );
    res.status(201).json(readOne(req, id));
  });

  /* ---------- Deleting a certification, record or document (and its file) ---------- */

  const CHILD_TABLES = { certs: "employee_certifications", records: "employee_records", documents: "employee_documents" };

  router.delete("/employees/:id/:kind/:childId", (req, res) => {
    const table = CHILD_TABLES[req.params.kind];
    if (!table) throw new HttpError(404, "Not found.");
    const id = ownEmployee(req);
    const row = db.prepare(`SELECT file_id FROM ${table} WHERE id = ? AND employee_id = ?`).get(req.params.childId, id);
    if (row) {
      transaction(db, () => {
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.childId);
        deleteFiles(db, dataDir, [row.file_id]);
      });
    }
    res.json(readOne(req, id));
  });

  return router;
};
