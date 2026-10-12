/**
 * Permits & renewals: the deadline list, its edit dialog, "mark renewed",
 * and the state starter list.
 */
(function (LC) {
  "use strict";
  const U = LC.utils;
  const { $, esc } = U;
  const S = LC.state;
  const store = LC.store;

  const CATEGORIES = {
    permit: "Permits & licenses",
    cert: "Certifications",
    fire: "Fire & life safety",
    service: "Facility service",
    labor: "Labor & tax",
  };

  /** Renewals that run from the old expiry date rather than the day the work was done. */
  const RENEW_FROM_DUE = ["permit", "cert", "labor"];

  let filter = "all";
  let editingId = null;
  let deleteArmed = false;

  function statusOf(item) {
    if (item.done) return { k: "mute", label: "Completed", sort: 1e6 };
    if (!item.due) return { k: "mute", label: "Set a date", sort: 9e5 };
    const d = U.daysUntil(item.due);
    if (d < 0) return { k: "bad", label: `${U.plural(-d, "day")} overdue`, sort: d };
    if (d === 0) return { k: "bad", label: "Due today", sort: 0 };
    if (d <= 30) return { k: "warn", label: `Due in ${U.plural(d, "day")}`, sort: d };
    return { k: "ok", label: d > 90 ? `Due in ${Math.round(d / 30.4)} months` : `Due in ${d} days`, sort: d };
  }

  /** Deadlines the user entered plus rows other features derive (employee certifications). */
  const allItems = () => LC.deadlineSources.reduce((list, source) => list.concat(source()), S.items.slice());

  function cycleText(item) {
    if (item.derived) return "From employee file";
    const months = +item.cycle || 0;
    if (!months) return "One-time";
    if (months === 1) return "Monthly";
    if (months === 12) return "Yearly";
    return `Every ${months} months`;
  }

  function itemRow({ item, status }) {
    const months = +item.cycle || 0;
    const actions = item.derived
      ? `<button class="btn small" data-act="emp-open" data-id="${esc(item.empId)}">Open employee file</button>`
      : (item.done
          ? ""
          : `<button class="btn small" data-act="renew" data-id="${esc(item.id)}">${months ? "Mark renewed" : "Mark done"}</button>`) +
        `<button class="btn small" data-act="edit" data-id="${esc(item.id)}">Edit</button>`;
    const meta = [CATEGORIES[item.cat] || "", item.agency, cycleText(item), item.lastDone && `Last done ${U.fmtDate(item.lastDone)}`]
      .filter(Boolean)
      .map(esc)
      .join(" · ");
    return `<div class="item ${status.k}"><span class="bar"></span>
      <div class="min0">
        <div class="row tight"><span class="name">${esc(item.name)}</span>${item.example ? '<span class="chip ex">Example</span>' : ""}</div>
        <div class="meta">${meta}</div>
        ${item.notes ? `<div class="meta note">${esc(item.notes)}</div>` : ""}
      </div>
      <div class="right">
        <span class="chip ${status.k}">${esc(status.label)}</span>
        ${item.due && !item.done ? `<span class="due">${esc(U.fmtDate(item.due))}</span>` : ""}
        <div class="row">${actions}</div>
      </div></div>`;
  }

  function render() {
    const filters = [["all", "All"]].concat(Object.entries(CATEGORIES));
    $("filters").innerHTML = filters
      .map(([key, label]) => `<button type="button" data-act="filter" data-id="${key}" aria-pressed="${filter === key}">${esc(label)}</button>`)
      .join("");

    if (!S.itemsLoaded) {
      $("dl-list").innerHTML = '<div class="empty">Loading your deadlines…</div>';
      return;
    }

    $("dl-banner").innerHTML = S.items.some((i) => i.example)
      ? '<div class="banner">Rows tagged <span class="chip ex">Example</span> have placeholder dates. Open each one and enter the date from your own permit, certificate or service receipt. Delete the ones that don’t apply to you.</div>'
      : "";

    const starter = S.items.length
      ? ""
      : `<div class="empty"><b>No deadlines yet.</b>
          <span>Start with the ${LC.config.starter.length} ${esc(LC.config.text.starterIntro)} You fill in the dates.</span>
          <button class="btn primary" data-act="starter">Add ${esc(LC.config.name)} starter list</button></div>`;

    const rows = allItems()
      .filter((i) => filter === "all" || i.cat === filter)
      .map((item) => ({ item, status: statusOf(item) }))
      .sort((a, b) => a.status.sort - b.status.sort || String(a.item.name).localeCompare(b.item.name));

    const empty = S.items.length ? '<div class="empty">Nothing in this category.</div>' : "";
    $("dl-list").innerHTML = starter + (rows.length ? rows.map(itemRow).join("") : empty);
  }

  /* ---------- Edit dialog ---------- */

  $("i-cat").innerHTML = Object.entries(CATEGORIES)
    .map(([key, label]) => `<option value="${key}">${esc(label)}</option>`)
    .join("");

  function openDialog(item) {
    editingId = item ? item.id : null;
    deleteArmed = false;
    $("ov-title").textContent = item ? "Edit deadline" : "Add deadline";
    $("i-name").value = item ? item.name : "";
    $("i-cat").value = item ? item.cat : "permit";
    $("i-cycle").value = String(item ? +item.cycle || 0 : 12);
    $("i-agency").value = item ? item.agency || "" : "";
    $("i-due").value = item ? item.due || "" : "";
    $("i-last").value = item ? item.lastDone || "" : "";
    $("i-notes").value = item ? item.notes || "" : "";
    $("i-del").hidden = !item;
    $("i-del").textContent = "Delete";
    $("ov").hidden = false;
    $("i-name").focus();
  }

  function closeDialog() {
    $("ov").hidden = true;
    editingId = null;
  }

  $("ov").addEventListener("click", (ev) => {
    if (ev.target === $("ov")) closeDialog();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !$("ov").hidden) closeDialog();
  });

  $("f-item").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const id = editingId || U.uid();
    const previous = S.items.find((i) => i.id === id) || {};
    const due = $("i-due").value;
    const data = {
      name: $("i-name").value.trim(),
      cat: $("i-cat").value,
      cycle: +$("i-cycle").value,
      agency: $("i-agency").value.trim(),
      due,
      lastDone: $("i-last").value,
      notes: $("i-notes").value.trim(),
      example: false,
      done: Boolean(previous.done && previous.due === due),
    };
    store.putItem(id, data);
    closeDialog();
    U.toast(`Saved ${data.name}.`);
  });

  /* ---------- Actions ---------- */

  Object.assign(LC.actions, {
    filter(el) {
      filter = el.dataset.id;
      render();
    },

    "add-item": () => openDialog(null),
    edit: (el) => openDialog(S.items.find((i) => i.id === el.dataset.id)),
    "close-ov": closeDialog,

    "del-item"(el) {
      if (!deleteArmed) {
        deleteArmed = true;
        el.textContent = "Click again to delete";
        return;
      }
      const removed = S.items.find((i) => i.id === editingId);
      store.deleteItem(editingId);
      closeDialog();
      if (removed) U.toast(`Deleted ${removed.name}.`, () => store.putItem(removed.id, removed));
    },

    renew(el) {
      const item = S.items.find((i) => i.id === el.dataset.id);
      if (!item) return;
      const before = U.clone(item);
      const next = U.clone(item);
      const months = +item.cycle || 0;
      const today = U.todayStr();
      next.lastDone = today;
      next.example = false;
      if (months) {
        const fromDue = RENEW_FROM_DUE.includes(item.cat) && item.due && U.daysUntil(item.due) >= 0;
        next.due = U.addMonths(fromDue ? item.due : today, months);
      } else {
        next.done = true;
      }
      store.putItem(item.id, next);
      U.toast(months ? `${item.name}: next due ${U.fmtDate(next.due)}.` : `${item.name} marked done.`, () =>
        store.putItem(item.id, before)
      );
    },

    starter() {
      LC.config.starter.forEach((s) =>
        store.putItem(U.uid(), {
          name: s.name,
          cat: s.category,
          cycle: s.cycleMonths,
          agency: s.agency,
          notes: s.notes,
          due: "",
          lastDone: "",
          example: false,
        })
      );
      U.toast(`Added ${LC.config.starter.length} deadlines. Open each to set its date.`);
    },
  });

  LC.features.push({ id: "deadlines", render });
  LC.deadlines = { statusOf, allItems };
})((window.LineCheck = window.LineCheck || {}));
