"use strict";

/**
 * Row → API shape converters. The API uses camelCase and the field names the
 * front end already works with; the database uses snake_case.
 */

const bool = (n) => n === 1;

const toRestaurant = (r) => ({
  id: r.id,
  name: r.name,
  state: r.state,
  address: r.address,
  city: r.city,
  county: r.county,
  zip: r.zip,
  phone: r.phone,
  permitNumber: r.permit_number,
  servesAlcohol: bool(r.serves_alcohol),
});

const toUnit = (u) => ({ id: u.id, name: u.name, kind: u.kind });

const toReading = (r) => ({
  id: r.id,
  at: r.logged_at,
  key: r.check_key,
  what: r.label,
  value: r.value,
  unit: r.unit,
  ok: bool(r.passed),
  by: r.initials,
  action: r.corrective_action,
});

const toCooling = (c) => ({
  id: c.id,
  food: c.food,
  start: c.start_time,
  t0: c.start_temp,
  by: c.initials,
  r2: c.check2_temp == null ? null : { v: c.check2_temp, at: c.check2_at },
  r6: c.check6_temp == null ? null : { v: c.check6_temp, at: c.check6_at },
});

const toDeadline = (d) => ({
  id: d.id,
  name: d.name,
  cat: d.category,
  cycle: d.cycle_months,
  agency: d.agency,
  due: d.due_date || "",
  lastDone: d.last_done || "",
  notes: d.notes,
  done: bool(d.done),
});

const fileFields = (row) => (row.file_id ? { fileId: row.file_id, fileName: row.file_name || "File" } : {});

const toCertification = (c) => ({
  id: c.id,
  type: c.type,
  title: c.title,
  number: c.number,
  provider: c.provider,
  issued: c.issued_on || "",
  expires: c.expires_on || "",
  ...fileFields(c),
});

const toRecord = (r) => ({
  id: r.id,
  date: r.record_date,
  type: r.type,
  summary: r.summary,
  details: r.details,
  by: r.recorded_by,
  ack: r.acknowledged_on || "",
  ...fileFields(r),
});

const toDocument = (d) => ({ id: d.id, label: d.label, date: d.uploaded_on, ...fileFields(d) });

const toEmployee = (e) => ({
  id: e.id,
  name: e.name,
  role: e.position,
  hireDate: e.hire_date || "",
  endDate: e.end_date || "",
  status: e.status,
  phone: e.phone,
  email: e.email,
  emerg: e.emergency_contact,
  alcohol: bool(e.serves_alcohol),
  notes: e.notes,
  certs: [],
  records: [],
  docs: [],
  onboard: {},
});

module.exports = { toRestaurant, toUnit, toReading, toCooling, toDeadline, toCertification, toRecord, toDocument, toEmployee };
