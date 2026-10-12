/**
 * Employee files: profile, certifications, onboarding checklist, records
 * (write-ups, training, illness reports…) and attached documents.
 *
 * Optional module. It only runs when the state config defines `employees`
 * and the page includes the Employees panel. Only owners and managers can
 * open employee files; the API enforces the same rule.
 */
(function (LC) {
  "use strict";
  const cfg = LC.config.employees;
  if (!cfg || !LC.state.canManage || !document.getElementById("p-staff")) return;

  const U = LC.utils;
  const { $, esc } = U;
  const S = LC.state;
  const store = LC.store;
  const api = LC.api;

  const RECORD_TYPES = {
    verbal: { label: "Verbal warning", k: "warn" },
    written: { label: "Written warning", k: "bad" },
    final: { label: "Final warning", k: "bad" },
    suspension: { label: "Suspension", k: "bad" },
    illness: { label: "Illness / exclusion report", k: "warn" },
    injury: { label: "Injury report", k: "warn" },
    training: { label: "Training completed", k: "ok" },
    review: { label: "Performance review", k: "mute" },
    commend: { label: "Commendation", k: "ok" },
    note: { label: "Note", k: "mute" },
  };
  /** Delete-button key prefix → API path segment. */
  const CHILD_PATHS = { cert: "certs", rec: "records", doc: "documents" };

  const view = { list: [], loaded: false, selected: null, filter: "active", query: "", armed: null, editing: null };
  let lastFileKey = "";

  /* ---------- Persistence ---------- */

  async function load() {
    view.list = await api.get("/employees");
    view.loaded = true;
  }

  async function start() {
    if (!S.canManage) {
      view.loaded = true;
      return;
    }
    await store.attempt(load);
    LC.render();
  }

  const refresh = () => (S.canManage ? load() : Promise.resolve());

  const getEmployee = (id) => view.list.find((e) => e.id === id) || null;

  /** Runs an API call that answers with one employee, and swaps it into the list. */
  async function apply(call) {
    const employee = await store.attempt(call);
    if (employee) {
      view.list = view.list.filter((e) => e.id !== employee.id).concat([employee]);
      lastFileKey = "";
      LC.render();
    }
    return employee;
  }

  /** Uploads the file chosen in an <input type=file>, if any. Resolves { fileId } or {}. */
  async function uploadFrom(inputId) {
    const input = $(inputId);
    const file = input && input.files && input.files[0];
    if (!file) return {};
    const uploaded = await api.upload(file);
    return { fileId: uploaded.id };
  }

  /* ---------- Certification rules ---------- */

  const certType = (type) => cfg.certTypes[type] || cfg.certTypes.other;
  const certLabel = (c) => (c.type === "other" && c.title ? c.title : certType(c.type).label);
  const isValid = (c) => Boolean(c) && U.daysUntil(c.expires) >= 0;
  const certTypesHeld = (e) => [...new Set((e.certs || []).map((c) => c.type))];

  function latestCert(e, type) {
    return (
      (e.certs || [])
        .filter((c) => c.type === type && c.expires)
        .sort((a, b) => (a.expires < b.expires ? 1 : -1))[0] || null
    );
  }

  /** Whether the food handler requirement is met, and if not, by when it must be. */
  function handlerState(e) {
    const rule = cfg.handler;
    const handler = latestCert(e, rule.type);
    const cover = latestCert(e, rule.coveredBy);
    if (isValid(handler) || isValid(cover)) return null;
    if (handler || cover) return { k: "bad", label: "Food handler card expired", due: (handler || cover).expires };
    if (e.hireDate) {
      const due = U.addDays(e.hireDate, rule.dueDays);
      const late = U.daysUntil(due) < 0;
      return { k: late ? "bad" : "warn", label: late ? "Food handler card overdue" : `Food handler card due by ${U.fmtDate(due)}`, due, missing: true };
    }
    return { k: "warn", label: "No food handler card on file", due: "" };
  }

  function issuesFor(e) {
    if (e.status === "former") return [];
    const issues = [];
    const handler = handlerState(e);
    if (handler) issues.push(handler);

    certTypesHeld(e).forEach((type) => {
      const c = latestCert(e, type);
      if (!c) return;
      const d = U.daysUntil(c.expires);
      if (type === cfg.handler.type) {
        if (!handler && d >= 0 && d <= 30) issues.push({ k: "warn", label: `Food handler card expires in ${U.plural(d, "day")}` });
        return;
      }
      if (d < 0) issues.push({ k: "bad", label: `${certLabel(c)} expired` });
      else if (d <= 30) issues.push({ k: "warn", label: `${certLabel(c)} expires in ${U.plural(d, "day")}` });
    });

    if (cfg.alcohol && e.alcohol && !isValid(latestCert(e, cfg.alcohol.type))) issues.push({ k: "mute", label: cfg.alcohol.label });

    const open = cfg.onboarding.filter((o) => !(e.onboard && e.onboard[o.id])).length;
    if (open) issues.push({ k: "mute", label: `${U.plural(open, "onboarding item")} open` });
    return issues;
  }

  /** Certification deadlines for the Permits & renewals tab. */
  function derivedDeadlines() {
    const rows = [];
    view.list.forEach((e) => {
      if (e.status === "former") return;
      const handler = handlerState(e);
      if (handler && handler.missing) {
        rows.push({ id: `emp-${e.id}-handler`, name: `Food handler card needed: ${e.name}`, cat: "cert", agency: `Within ${cfg.handler.dueDays} days of hire`, due: handler.due, derived: true, empId: e.id });
      }
      certTypesHeld(e).forEach((type) => {
        const c = latestCert(e, type);
        if (!c) return;
        if (type === cfg.handler.type && !handler && U.daysUntil(c.expires) < 0) return; // covered by a manager certificate
        rows.push({ id: `emp-${e.id}-${type}`, name: `${certLabel(c)}: ${e.name}`, cat: "cert", agency: c.provider || "", due: c.expires, derived: true, empId: e.id });
      });
    });
    return rows;
  }

  /* ---------- Render: list ---------- */

  function issueChips(issues, max) {
    if (!issues.length) return '<span class="chip ok">File complete</span>';
    const shown = issues.slice(0, max || issues.length).map((i) => `<span class="chip ${i.k}">${esc(i.label)}</span>`).join("");
    return shown + (max && issues.length > max ? `<span class="chip mute">+${issues.length - max} more</span>` : "");
  }

  function renderList() {
    $("emp-filters").innerHTML = [["active", "Active"], ["former", "Former"], ["all", "All"]]
      .map(([key, label]) => `<button type="button" data-act="emp-filter" data-id="${key}" aria-pressed="${view.filter === key}">${label}</button>`)
      .join("");

    if (!view.loaded) {
      $("emp-list").innerHTML = '<div class="empty full">Loading employee files…</div>';
      return;
    }
    if (!view.list.length) {
      $("emp-list").innerHTML = `<div class="empty full"><b>No employee files yet.</b>
        <span>Add each person on your team to keep their food handler card, manager certificate, onboarding paperwork, write-ups and training in one place. Cards that are expiring show up on the Permits &amp; renewals tab automatically.</span>
        <button class="btn primary" data-act="emp-new">Add your first employee</button></div>`;
      return;
    }

    const q = view.query.toLowerCase();
    const shown = view.list
      .filter((e) => view.filter === "all" || (e.status || "active") === view.filter)
      .filter((e) => !q || `${e.name} ${e.role || ""}`.toLowerCase().includes(q))
      .sort((a, b) => String(a.name).localeCompare(b.name));

    $("emp-list").innerHTML = shown.length
      ? shown
          .map((e) => {
            const certs = (e.certs || []).length;
            const records = (e.records || []).length;
            const status =
              e.status === "former"
                ? `<span class="chip mute">Former${e.endDate ? ` · left ${esc(U.fmtDate(e.endDate))}` : ""}</span>`
                : issueChips(issuesFor(e), 3);
            return `<button type="button" class="emp" data-act="emp-open" data-id="${esc(e.id)}">
              <span class="who"><span class="avatar">${esc(U.initials(e.name))}</span>
                <span><span class="nm">${esc(e.name)}</span>
                <span class="sub">${esc(e.role || "No position set")}${e.hireDate ? ` · Hired ${esc(U.fmtDate(e.hireDate))}` : ""}</span></span></span>
              <span class="chips">${status}</span>
              <span class="sub">${U.plural(certs, "certification")} · ${U.plural(records, "record")}</span></button>`;
          })
          .join("")
      : '<div class="empty full">No employees match.</div>';
  }

  /* ---------- Render: one employee's file ---------- */

  const fileLink = (x) =>
    x.fileId ? `<a href="/api/files/${esc(x.fileId)}" target="_blank" rel="noopener">${esc(x.fileName || "View file")}</a>` : "";
  const fileInput = (id) =>
    `<label class="wide">Attach photo or PDF (optional) <input id="${id}" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,application/pdf"></label>`;

  function deleteButton(key, label = "Delete") {
    const armed = view.armed === key;
    return `<button type="button" class="btn small${armed ? " danger" : ""}" data-act="emp-del" data-key="${esc(key)}">${armed ? "Confirm delete" : label}</button>`;
  }

  function headerCard(e) {
    const former = e.status === "former";
    return `<div class="row"><button type="button" class="btn small" data-act="emp-back">← All employees</button></div>
      <div class="card">
        <div class="row nowrap file-head"><span class="avatar big">${esc(U.initials(e.name))}</span>
          <div class="body">
            <div class="row"><h2>${esc(e.name)}</h2><span class="chip ${former ? "mute" : "ok"}">${former ? "Former employee" : "Active"}</span></div>
            <div class="sub">${esc(e.role || "No position set")}${e.hireDate ? ` · Hired ${esc(U.fmtDate(e.hireDate))}` : ""}${former && e.endDate ? ` · Last day ${esc(U.fmtDate(e.endDate))}` : ""}</div>
            <div class="chips">${former ? "" : issueChips(issuesFor(e))}</div>
          </div></div>
        <div class="row">
          <button type="button" class="btn small" data-act="emp-edit">Edit profile</button>
          <button type="button" class="btn small" data-act="emp-status">${former ? "Reactivate" : "Mark as former employee"}</button>
        </div></div>`;
  }

  function certificationsCard(e) {
    const certs = (e.certs || []).slice().sort((a, b) => ((a.expires || "") < (b.expires || "") ? 1 : -1));
    const statusChip = (c) => {
      if (!c.expires) return '<span class="chip mute">No expiry</span>';
      const d = U.daysUntil(c.expires);
      if (d < 0) return '<span class="chip bad">Expired</span>';
      if (d <= 30) return `<span class="chip warn">${U.plural(d, "day")} left</span>`;
      return '<span class="chip ok">Valid</span>';
    };
    const table = certs.length
      ? `<div class="tablewrap"><table>
          <thead><tr><th>Certificate</th><th>Number</th><th>Issued</th><th>Expires</th><th>Status</th><th>File</th><th></th></tr></thead>
          <tbody>${certs
            .map(
              (c) => `<tr>
                <td>${esc(certLabel(c))}${c.provider ? `<div class="sub">${esc(c.provider)}</div>` : ""}</td>
                <td class="mono">${esc(c.number || "—")}</td>
                <td class="num">${esc(U.fmtDate(c.issued) || "—")}</td>
                <td class="num">${esc(U.fmtDate(c.expires) || "—")}</td>
                <td>${statusChip(c)}</td>
                <td>${fileLink(c) || '<span class="sub">—</span>'}</td>
                <td>${deleteButton(`cert:${c.id}`, "✕")}</td></tr>`
            )
            .join("")}</tbody></table></div>`
      : '<div class="empty">No certifications on file yet.</div>';

    return `<div class="card">
      <div><h2>Certifications</h2><p class="sub">${esc(cfg.handler.hint)}</p></div>
      ${table}
      <form id="fc-form" class="form formbox" autocomplete="off">
        <label>Type <select id="fc-type">${Object.entries(cfg.certTypes)
          .map(([key, t]) => `<option value="${key}">${esc(t.label)}</option>`)
          .join("")}</select></label>
        <label>Name (for Other) <input id="fc-title" type="text" maxlength="60"></label>
        <label>Certificate number <input id="fc-num" type="text" maxlength="40"></label>
        <label>Provider <input id="fc-prov" type="text" maxlength="60"></label>
        <label>Issued <input id="fc-iss" type="date"></label>
        <label>Expires <input id="fc-exp" type="date"></label>
        ${fileInput("fc-file")}
        <div class="wide row"><button class="btn primary" type="submit">Add certification</button>
          <span class="sub">Leave Expires blank to fill it in from the issue date.</span></div>
      </form></div>`;
  }

  function recordsCard(e) {
    const records = (e.records || []).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const list = records.length
      ? `<div class="timeline">${records
          .map((r) => {
            const type = RECORD_TYPES[r.type] || RECORD_TYPES.note;
            const ack = r.ack
              ? `<span class="chip ok">Employee acknowledged ${esc(U.fmtDate(r.ack))}</span>`
              : `<button type="button" class="btn small" data-act="emp-ack" data-id="${esc(r.id)}">Mark acknowledged by employee</button>`;
            return `<div class="rec ${type.k}">
              <div class="row"><span class="mono sub">${esc(U.fmtDate(r.date))}</span><span class="chip ${type.k}">${esc(type.label)}</span>
                <span class="spacer"></span>${deleteButton(`rec:${r.id}`, "✕")}</div>
              <b>${esc(r.summary)}</b>
              ${r.details ? `<div class="det">${esc(r.details)}</div>` : ""}
              <div class="row sub">${r.by ? `<span>Recorded by ${esc(r.by)}</span>` : ""}${ack}${fileLink(r)}</div></div>`;
          })
          .join("")}</div>`
      : '<div class="empty">No records yet.</div>';

    return `<div class="card">
      <div><h2>Records</h2><p class="sub">Write-ups, training, illness and injury reports, reviews and notes. Newest first.</p></div>
      ${list}
      <form id="fr-form" class="form formbox" autocomplete="off">
        <label>Date <input id="fr-date" type="date" value="${U.todayStr()}" required></label>
        <label>Type <select id="fr-type">${Object.entries(RECORD_TYPES)
          .map(([key, t]) => `<option value="${key}">${esc(t.label)}</option>`)
          .join("")}</select></label>
        <label>Recorded by <input id="fr-by" type="text" maxlength="60"></label>
        <label class="wide">Summary <input id="fr-sum" type="text" maxlength="120" placeholder="e.g. No hair restraint during prep, second time this month" required></label>
        <label class="wide">Details <textarea id="fr-det" maxlength="4000" placeholder="What happened, what was discussed, what happens next"></textarea></label>
        <label class="wide check inline"><input id="fr-ack" type="checkbox"><span>Employee has seen and signed this</span></label>
        ${fileInput("fr-file")}
        <div class="wide row"><button class="btn primary" type="submit">Add record</button></div>
      </form></div>`;
  }

  function onboardingCard(e) {
    const done = e.onboard || {};
    return `<div class="card"><h2>Onboarding</h2><div class="checks">${cfg.onboarding
      .map((o) => {
        const at = done[o.id];
        return `<label class="check${at ? " done" : ""}">
          <input type="checkbox" data-act="emp-onb" data-id="${esc(o.id)}"${at ? " checked" : ""}>
          <span><span class="t">${esc(o.text)}</span>${o.note ? `<span class="cite">${esc(o.note)}</span>` : ""}</span>
          <span class="when">${at ? esc(U.fmtShortDate(at)) : ""}</span></label>`;
      })
      .join("")}</div></div>`;
  }

  function documentsCard(e) {
    const docs = (e.docs || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const list = docs.length
      ? `<div class="checks">${docs
          .map(
            (d) => `<div class="list-row"><span class="min0 wrap-any"><b>${esc(d.label)}</b><span class="sub"> · ${esc(U.fmtDate(d.date))}</span><br>${fileLink(d)}</span>
              <span class="spacer"></span>${deleteButton(`doc:${d.id}`, "✕")}</div>`
          )
          .join("")}</div>`
      : '<div class="empty">No documents yet.</div>';
    const form = `<form id="fd-form" class="form formbox" autocomplete="off">
          <label class="wide">Label <input id="fd-label" type="text" maxlength="80" placeholder="e.g. Signed I-9" required></label>
          <label class="wide">File (photo or PDF) <input id="fd-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,application/pdf" required></label>
          <div class="wide row"><button class="btn primary" type="submit">Upload document</button></div></form>`;
    return `<div class="card"><div><h2>Documents</h2><p class="sub">Scans of the signed I-9, W-4, health agreement, ID copies and anything else.</p></div>${list}${form}</div>`;
  }

  /** Federal rule: keep the I-9 for 3 years after hire or 1 year after the last day, whichever is later. */
  function i9RetainUntil(e) {
    if (e.status !== "former" || !e.hireDate || !e.endDate) return null;
    return [U.addMonths(e.hireDate, 36), U.addMonths(e.endDate, 12)].sort()[1];
  }

  function contactCard(e) {
    const i9 = i9RetainUntil(e);
    return `<div class="card"><h2>Contact &amp; notes</h2><dl class="kv">
      <dt>Phone</dt><dd>${esc(e.phone || "—")}</dd>
      <dt>Email</dt><dd>${esc(e.email || "—")}</dd>
      <dt>Emergency</dt><dd>${esc(e.emerg || "—")}</dd>
      <dt>Alcohol</dt><dd>${e.alcohol ? "Serves or sells alcohol" : "No"}</dd>
      ${e.notes ? `<dt>Notes</dt><dd>${esc(e.notes)}</dd>` : ""}
      ${i9 ? `<dt>Keep I-9 until</dt><dd>${esc(U.fmtDate(i9))} <span class="sub">(3 years after hire or 1 year after the last day, whichever is later)</span></dd>` : ""}
      </dl></div>`;
  }

  function deleteCard(e) {
    return `<div class="card"><h2>Delete this file</h2>
      <p class="sub">Removes every certification, record and attached document for ${esc(e.name)}. For people who have left, marking them as a former employee keeps the records you may need to retain.</p>
      <div class="row">${deleteButton("emp", "Delete employee file")}</div></div>`;
  }

  function renderFile(e) {
    const key = [JSON.stringify(e), view.armed, U.todayStr()].join("|");
    if (key === lastFileKey) return;
    lastFileKey = key;
    const el = $("staff-file-view");
    U.keepInputs(el, () => {
      el.innerHTML =
        headerCard(e) +
        `<div class="grid2">
          <div class="stack">${certificationsCard(e)}${recordsCard(e)}</div>
          <div class="stack">${onboardingCard(e)}${documentsCard(e)}${contactCard(e)}${deleteCard(e)}</div>
        </div>`;
    });
  }

  function render() {
    const locked = !S.canManage;
    $("staff-locked").hidden = !locked;
    if (locked) {
      $("staff-list-view").hidden = true;
      $("staff-file-view").hidden = true;
      return;
    }
    const e = view.selected ? getEmployee(view.selected) : null;
    if (view.selected && !e && view.loaded) view.selected = null;
    $("staff-list-view").hidden = Boolean(e);
    $("staff-file-view").hidden = !e;
    if (e) renderFile(e);
    else {
      lastFileKey = "";
      renderList();
    }
  }

  /* ---------- Profile dialog ---------- */

  function openProfile(e) {
    view.editing = e ? e.id : null;
    $("ove-title").textContent = e ? "Edit profile" : "Add employee";
    $("e-name").value = e ? e.name : "";
    $("e-role").value = e ? e.role || "" : "";
    $("e-hire").value = e ? e.hireDate || "" : U.todayStr();
    $("e-phone").value = e ? e.phone || "" : "";
    $("e-email").value = e ? e.email || "" : "";
    $("e-emerg").value = e ? e.emerg || "" : "";
    $("e-alc").checked = Boolean(e && e.alcohol);
    $("e-end").value = e ? e.endDate || "" : "";
    $("e-notes").value = e ? e.notes || "" : "";
    $("ov-emp").hidden = false;
    $("e-name").focus();
  }

  const closeProfile = () => ($("ov-emp").hidden = true);

  $("ov-emp").addEventListener("click", (ev) => {
    if (ev.target === $("ov-emp")) closeProfile();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !$("ov-emp").hidden) closeProfile();
  });
  $("emp-q").addEventListener("input", () => {
    view.query = $("emp-q").value;
    renderList();
  });

  $("f-emp").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fields = {
      name: $("e-name").value.trim(),
      role: $("e-role").value.trim(),
      hireDate: $("e-hire").value,
      phone: $("e-phone").value.trim(),
      email: $("e-email").value.trim(),
      emerg: $("e-emerg").value.trim(),
      alcohol: $("e-alc").checked,
      endDate: $("e-end").value,
      notes: $("e-notes").value.trim(),
    };
    if (!fields.name) return;
    closeProfile();
    if (view.editing) {
      if (await apply(() => api.patch(`/employees/${view.editing}`, fields))) U.toast("Profile saved.");
    } else {
      const created = await apply(() => api.post("/employees", fields));
      if (created) {
        view.selected = created.id;
        LC.render();
        U.toast(`Created a file for ${fields.name}.`);
      }
    }
  });

  /* ---------- File forms (rendered dynamically, so delegated) ---------- */

  const FORM_HANDLERS = {
    async "fc-form"(form, e) {
      const type = $("fc-type").value;
      const issued = $("fc-iss").value;
      let expires = $("fc-exp").value;
      if (!expires && issued && certType(type).months) expires = U.addMonths(issued, certType(type).months);
      const cert = {
        type,
        title: $("fc-title").value.trim(),
        number: $("fc-num").value.trim(),
        provider: $("fc-prov").value.trim(),
        issued,
        expires,
        ...(await uploadFrom("fc-file")),
      };
      if (await apply(() => api.post(`/employees/${e.id}/certs`, cert))) {
        form.reset();
        U.toast(`Added ${certLabel(cert)}${expires ? `, expires ${U.fmtDate(expires)}` : ""}.`);
      }
    },

    async "fr-form"(form, e) {
      const record = {
        date: $("fr-date").value,
        type: $("fr-type").value,
        by: $("fr-by").value.trim(),
        summary: $("fr-sum").value.trim(),
        details: $("fr-det").value.trim(),
        ack: $("fr-ack").checked,
        ...(await uploadFrom("fr-file")),
      };
      if (await apply(() => api.post(`/employees/${e.id}/records`, record))) {
        form.reset();
        U.toast("Record added.");
      }
    },

    async "fd-form"(form, e) {
      const label = $("fd-label").value.trim();
      const file = await uploadFrom("fd-file");
      if (await apply(() => api.post(`/employees/${e.id}/documents`, { label, ...file }))) {
        form.reset();
        U.toast(`Uploaded ${label}.`);
      }
    },
  };

  document.addEventListener("submit", async (ev) => {
    const form = ev.target;
    const handler = FORM_HANDLERS[form.id];
    if (!handler) return;
    ev.preventDefault();
    const e = getEmployee(view.selected);
    if (!e) return;
    const button = form.querySelector("button[type=submit]");
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await handler(form, e);
    } catch (err) {
      U.toast(err.message || "Couldn't save. Try again.");
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });

  /* ---------- Actions ---------- */

  const selected = () => (view.selected ? getEmployee(view.selected) : null);

  Object.assign(LC.actions, {
    "emp-new": () => openProfile(null),
    "emp-close": closeProfile,

    "emp-open"(el) {
      view.selected = el.dataset.id;
      view.armed = null;
      lastFileKey = "";
      LC.setTab("staff");
      LC.render();
      window.scrollTo(0, 0);
    },

    "emp-back"() {
      view.selected = null;
      view.armed = null;
      LC.render();
    },

    "emp-filter"(el) {
      view.filter = el.dataset.id;
      renderList();
    },

    "emp-edit"() {
      const e = selected();
      if (e) openProfile(e);
    },

    async "emp-status"() {
      const e = selected();
      if (!e) return;
      const toFormer = e.status !== "former";
      const fields = toFormer ? { status: "former", endDate: e.endDate || U.todayStr() } : { status: "active" };
      if (await apply(() => api.patch(`/employees/${e.id}`, fields))) {
        U.toast(toFormer ? `${e.name} moved to former employees.` : `${e.name} is active again.`);
      }
    },

    "emp-onb"(el) {
      const e = selected();
      if (!e) return;
      apply(() => api.put(`/employees/${e.id}/onboarding/${encodeURIComponent(el.dataset.id)}`, { done: el.checked, date: U.todayStr() }));
    },

    "emp-ack"(el) {
      const e = selected();
      if (!e) return;
      apply(() => api.patch(`/employees/${e.id}/records/${el.dataset.id}`, { ack: true }));
    },

    /** Two-step delete: the first click arms the button, the second deletes. */
    async "emp-del"(el) {
      const e = selected();
      if (!e) return;
      const key = el.dataset.key;
      if (view.armed !== key) {
        view.armed = key;
        lastFileKey = "";
        render();
        return;
      }
      view.armed = null;
      const [kind, id] = key.split(":");
      if (kind === "emp") {
        if ((await store.attempt(() => api.del(`/employees/${e.id}`))) === undefined) return;
        view.list = view.list.filter((x) => x.id !== e.id);
        view.selected = null;
        LC.render();
        U.toast(`Deleted ${e.name}’s file.`);
        return;
      }
      apply(() => api.del(`/employees/${e.id}/${CHILD_PATHS[kind]}/${id}`));
    },
  });

  LC.deadlineSources.push(derivedDeadlines);
  LC.features.push({ id: "staff", start, refresh, render });
})((window.LineCheck = window.LineCheck || {}));
