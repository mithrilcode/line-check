/**
 * Today's log: temperature and sanitizer readings, shift checklists,
 * the cooling log, holding-unit setup, and the facility name fields.
 */
(function (LC) {
  "use strict";
  const U = LC.utils;
  const { $, esc } = U;
  const S = LC.state;
  const store = LC.store;

  /** Holding limits shared by both states' food codes. */
  const HOLDING = {
    cold: { max: 41, rule: "41°F or below" },
    freezer: { max: 0, rule: "0°F or below (house standard: food must stay frozen)" },
    hot: { min: 135, rule: "135°F or above" },
  };

  const inRange = (spec, v) => (spec.min == null || v >= spec.min) && (spec.max == null || v <= spec.max);

  /** Resolves a "What you checked" option to its label, unit and limit. */
  function resolveCheck(key) {
    if (!key) return null;
    if (key.startsWith("u:")) {
      const unit = S.settings.units.find((u) => `u:${u.id}` === key);
      if (!unit) return null;
      const spec = HOLDING[unit.kind];
      return { label: unit.name, unit: "°F", spec, rule: spec.rule };
    }
    const c = LC.config.checks.find((x) => `c:${x.key}` === key);
    return c ? { label: c.label, unit: c.unit, spec: c, rule: c.rule } : null;
  }

  /* ---------- Render ---------- */

  let lastUnitsKey = "";

  function renderUnitOptions() {
    const key = JSON.stringify(S.settings.units);
    if (key === lastUnitsKey) return;
    lastUnitsKey = key;

    const select = $("t-what");
    const previous = select.value;
    const groups = {};
    LC.config.checks.forEach((c) => (groups[c.group] = groups[c.group] || []).push(c));

    select.innerHTML =
      '<option value="">Choose…</option>' +
      `<optgroup label="Holding units">${S.settings.units
        .map((u) => `<option value="u:${esc(u.id)}">${esc(u.name)}</option>`)
        .join("")}</optgroup>` +
      Object.keys(groups)
        .map(
          (g) =>
            `<optgroup label="${esc(g)}">${groups[g]
              .map((c) => `<option value="c:${esc(c.key)}">${esc(c.label)}</option>`)
              .join("")}</optgroup>`
        )
        .join("");
    select.value = previous;
    updateHint();

    $("units").innerHTML = `<div class="checks">${S.settings.units
      .map(
        (u) => `<div class="list-row"><span>${esc(u.name)}</span>
          <span class="chip mute">${esc(HOLDING[u.kind].rule.split(" (")[0])}</span>
          <span class="spacer"></span>
          <button class="btn small" data-act="del-unit" data-id="${esc(u.id)}">Remove</button></div>`
      )
      .join("")}</div>`;
  }

  function renderReadings(day) {
    const rows = day.temps.slice().sort((a, b) => (a.at < b.at ? 1 : -1));
    if (!rows.length) {
      $("temps").innerHTML = `<div class="empty">No readings for ${esc(U.fmtDate(S.date))} yet. Log the walk-in first thing and again mid-shift.</div>`;
      return;
    }
    $("temps").innerHTML = `<table>
      <thead><tr><th>Time</th><th>Check</th><th class="r">Reading</th><th>Result</th><th>By</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (t) => `<tr class="${t.ok ? "" : "fail"}">
            <td class="num">${esc(U.fmtHM(t.at))}</td>
            <td>${esc(t.what)}${t.action ? `<div class="sub">Action: ${esc(t.action)}</div>` : ""}</td>
            <td class="num">${esc(t.value)} ${esc(t.unit)}</td>
            <td><span class="chip ${t.ok ? "ok" : "bad"}">${t.ok ? "Pass" : "Out of range"}</span></td>
            <td class="mono">${esc(t.by)}</td>
            <td><button class="btn small" data-act="del-temp" data-id="${esc(t.id)}" aria-label="Remove reading">✕</button></td>
          </tr>`
        )
        .join("")}</tbody></table>`;
  }

  function renderShiftChecks(day) {
    const done = day.checks || {};
    $("checks").innerHTML = LC.config.shiftChecks
      .map(
        (g) => `<h3>${esc(g.group)}</h3><div class="checks">${g.items
          .map((i) => {
            const at = done[i.id];
            return `<label class="check${at ? " done" : ""}">
              <input type="checkbox" data-act="tick" data-id="${esc(i.id)}"${at ? " checked" : ""}>
              <span class="t">${esc(i.text)}</span>
              <span class="when">${at ? esc(U.fmtHM(at)) : ""}</span></label>`;
          })
          .join("")}</div>`
      )
      .join("");
  }

  /** Status of a cooling batch against the 2-hour / 6-hour rule. */
  function coolingStatus(b) {
    const t2 = U.hmAdd(b.start, 120);
    const t6 = U.hmAdd(b.start, 360);
    const elapsed = S.date === U.todayStr() || b.r6 ? U.minsSince(S.date, b.start) : Infinity;
    if (b.r2 && b.r2.v > 70) return { cls: "bad", text: "Missed 70°F at 2 hours. Reheat to 165°F and restart, or discard." };
    if (b.r6 && b.r6.v > 41) return { cls: "bad", text: "Missed 41°F at 6 hours. Discard." };
    if (b.r6) return { cls: "ok", text: "Cooled safely." };
    if (!b.r2 && elapsed > 120) return { cls: "bad", text: "2-hour check is overdue." };
    if (b.r2 && elapsed > 360) return { cls: "bad", text: "6-hour check is overdue." };
    if (!b.r2) return { cls: "warn", text: `Next: under 70°F by ${U.fmtHM(t2.hm)}.` };
    return { cls: "warn", text: `Next: under 41°F by ${U.fmtHM(t6.hm)}${t6.nextDay ? " tomorrow" : ""}.` };
  }

  function coolingStep(b, label, reading, which, due) {
    const body = reading
      ? `<b>${esc(reading.v)}°F</b><span class="sub">at ${esc(U.fmtHM(reading.at))}</span>`
      : `<div class="mini">
          <input id="cv${which}-${esc(b.id)}" type="number" step="0.1" inputmode="decimal" placeholder="°F" aria-label="${label} reading">
          <button class="btn small" data-act="cool-read" data-w="${which}" data-id="${esc(b.id)}">Log</button></div>`;
    return `<div class="step"><span>${label} · by ${esc(U.fmtHM(due))}</span>${body}</div>`;
  }

  function coolingBatch(b) {
    const status = coolingStatus(b);
    const t2 = U.hmAdd(b.start, 120).hm;
    const t6 = U.hmAdd(b.start, 360).hm;
    const finalStep = b.r2
      ? coolingStep(b, "≤41°F", b.r6, 6, t6)
      : `<div class="step"><span>≤41°F · by ${esc(U.fmtHM(t6))}</span><span class="sub">After the 2-hour check</span></div>`;
    return `<div class="batch ${status.cls}">
      <div class="row"><b>${esc(b.food)}</b><span class="sub">${esc(b.by)}</span><span class="spacer"></span>
        <span class="chip ${status.cls}">${esc(status.text)}</span>
        <button class="btn small" data-act="del-cool" data-id="${esc(b.id)}" aria-label="Remove batch">✕</button></div>
      <div class="steps">
        <div class="step"><span>Start · ${esc(U.fmtHM(b.start))}</span><b>${esc(b.t0)}°F</b></div>
        ${coolingStep(b, "≤70°F", b.r2, 2, t2)}
        ${finalStep}
      </div></div>`;
  }

  function render() {
    $("day").value = S.date;
    renderUnitOptions();
    if (!$("t-at").value) $("t-at").value = U.nowHM();
    if (!$("c-start").value) $("c-start").value = U.nowHM();

    const day = S.day;
    if (!day) {
      $("temps").innerHTML = '<div class="empty">Loading this day’s log…</div>';
      $("checks").innerHTML = "";
      $("cooling").innerHTML = "";
      return;
    }
    renderReadings(day);
    renderShiftChecks(day);
    U.keepInputs($("cooling"), () => {
      $("cooling").innerHTML = day.cooling.length
        ? day.cooling.map(coolingBatch).join("")
        : '<div class="empty">No cooling batches today. Start one when a hot item comes off the stove for storage.</div>';
    });
  }

  /* ---------- Reading form ---------- */

  function updateHint() {
    const check = resolveCheck($("t-what").value);
    const value = parseFloat($("t-val").value);
    const hint = $("t-hint");
    let ok = true;
    if (!check) {
      hint.className = "wide hint";
      hint.textContent = "Choose a check to see its limit.";
    } else if (Number.isNaN(value)) {
      hint.className = "wide hint";
      hint.textContent = `Limit: ${check.rule}.`;
    } else {
      ok = inRange(check.spec, value);
      hint.className = `wide hint ${ok ? "ok" : "bad"}`;
      hint.textContent = ok
        ? `Pass. Limit: ${check.rule}.`
        : `Out of range. Limit: ${check.rule}. Record what you did about it.`;
    }
    $("t-act-wrap").hidden = ok;
    $("t-act").required = !ok;
  }

  $("t-what").addEventListener("change", updateHint);
  $("t-val").addEventListener("input", updateHint);

  $("f-temp").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const check = resolveCheck($("t-what").value);
    if (!check) {
      $("t-what").focus();
      return;
    }
    const value = parseFloat($("t-val").value);
    const ok = inRange(check.spec, value);
    const entry = {
      id: U.uid(),
      at: $("t-at").value,
      what: check.label,
      key: $("t-what").value,
      value,
      unit: check.unit,
      ok,
      by: $("t-by").value.trim().toUpperCase(),
      action: ok ? "" : $("t-act").value.trim(),
    };
    store.mutateDay((d) => d.temps.push(entry));
    $("t-val").value = "";
    $("t-act").value = "";
    $("t-at").value = U.nowHM();
    updateHint();
    $("t-val").focus();
    U.toast(ok ? `Logged ${check.label} at ${value} ${check.unit}.` : "Logged out-of-range reading with corrective action.");
  });

  /* ---------- Cooling form ---------- */

  $("f-cool").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const batch = {
      id: U.uid(),
      food: $("c-food").value.trim(),
      start: $("c-start").value,
      t0: parseFloat($("c-t0").value),
      by: $("c-by").value.trim().toUpperCase(),
      r2: null,
      r6: null,
    };
    store.mutateDay((d) => d.cooling.push(batch));
    $("c-food").value = "";
    $("c-t0").value = "";
    $("c-start").value = U.nowHM();
    U.toast(`Cooling started. 70°F due by ${U.fmtHM(U.hmAdd(batch.start, 120).hm)}.`);
  });

  /* ---------- Holding units, date picker, facility name ---------- */

  $("f-unit").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const name = $("u-name").value.trim();
    if (!name) return;
    const kind = $("u-kind").value;
    store.mutateSettings((s) => s.units.push({ id: U.uid(), name, kind }));
    $("u-name").value = "";
  });

  $("day").addEventListener("change", () => {
    if ($("day").value) store.setDate($("day").value);
  });

  let nameTimer = null;
  function saveFacility() {
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => {
      const name = $("bizname").value.trim();
      const county = $("county").value.trim();
      if (name === (S.settings.name || "") && county === (S.settings.county || "")) return;
      store.mutateSettings((s) => {
        s.name = name;
        s.county = county;
      });
    }, 700);
  }
  $("bizname").addEventListener("input", saveFacility);
  $("county").addEventListener("input", saveFacility);

  /* ---------- Actions ---------- */

  Object.assign(LC.actions, {
    today: () => store.setDate(U.todayStr()),

    tick(el) {
      const at = el.checked ? U.nowHM() : null;
      const id = el.dataset.id;
      store.mutateDay((d) => {
        d.checks = d.checks || {};
        if (at) d.checks[id] = at;
        else delete d.checks[id];
      });
    },

    "del-temp"(el) {
      const id = el.dataset.id;
      const removed = S.day.temps.find((t) => t.id === id);
      store.mutateDay((d) => {
        d.temps = d.temps.filter((t) => t.id !== id);
      });
      U.toast("Reading removed.", () => store.mutateDay((d) => d.temps.push(removed)));
    },

    "del-cool"(el) {
      const id = el.dataset.id;
      const removed = S.day.cooling.find((c) => c.id === id);
      store.mutateDay((d) => {
        d.cooling = d.cooling.filter((c) => c.id !== id);
      });
      U.toast("Batch removed.", () => store.mutateDay((d) => d.cooling.push(removed)));
    },

    "cool-read"(el) {
      const which = el.dataset.w;
      const id = el.dataset.id;
      const input = $(`cv${which}-${id}`);
      const value = parseFloat(input && input.value);
      if (Number.isNaN(value)) {
        if (input) input.focus();
        return;
      }
      store.mutateDay((d) => {
        const batch = d.cooling.find((x) => x.id === id);
        if (batch) batch[`r${which}`] = { v: value, at: U.nowHM() };
      });
    },

    "del-unit"(el) {
      const id = el.dataset.id;
      store.mutateSettings((s) => {
        s.units = s.units.filter((u) => u.id !== id);
      });
    },
  });

  // Keep cooling deadlines current while the log is open.
  setInterval(() => {
    if (S.tab === "today" && S.day && S.day.cooling.length) render();
  }, 60000);

  LC.features.push({ id: "today", render });
  LC.dailyLog = { inRange, resolveCheck };
})((window.LineCheck = window.LineCheck || {}));
