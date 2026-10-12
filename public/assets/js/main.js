/**
 * Entry point: fills in state-specific page text, renders the summary strip,
 * wires tabs, the account menu and the shared click-action dispatcher, then
 * loads data from the API. Loaded last by boot.js.
 */
(function (LC) {
  "use strict";
  const U = LC.utils;
  const { $, esc } = U;
  const S = LC.state;
  const store = LC.store;
  const text = LC.config.text;

  /* ---------- State-specific page text ---------- */

  document.title = `${S.restaurant.name} · Line Check`;
  $("code-name").textContent = text.codeName;
  $("locality-label").textContent = text.localityLabel;
  $("county").placeholder = text.localityPlaceholder;
  $("cooling-note").textContent = text.coolingNote;
  $("inspection-intro").innerHTML = esc(text.inspectionIntro).replace("{label}", `<span class="major">${esc(text.priorityLabel)}</span>`);
  $("footer-text").textContent = text.footer;
  $("user-name").textContent = S.user.name;

  // Employee files are for owners and managers in states that have the module configured.
  const showStaff = Boolean(LC.config.employees) && S.canManage;
  document.querySelector('[data-tab="staff"]').hidden = !showStaff;
  if (!showStaff) $("p-staff").remove();

  // Only owners and managers can rename the restaurant.
  $("bizname").readOnly = !S.canManage;
  $("county").readOnly = !S.canManage;

  fetch(`/partials/reference-${LC.config.id}.html`, { credentials: "same-origin" })
    .then((res) => (res.ok ? res.text() : ""))
    .then((html) => {
      $("p-reference").innerHTML = html;
    })
    .catch(() => {});

  /* ---------- Summary strip & page chrome ---------- */

  function setTile(id, value, cls) {
    const el = $(id);
    el.querySelector(".n").textContent = value;
    el.className = `tile ${cls || ""}`;
  }

  function renderChrome() {
    if (document.activeElement !== $("bizname")) $("bizname").value = S.restaurant.name || "";
    if (document.activeElement !== $("county")) $("county").value = S.restaurant.county || "";
  }

  function renderSummary() {
    if (S.itemsLoaded) {
      let overdue = 0;
      let soon = 0;
      LC.deadlines.allItems().forEach((item) => {
        const { k } = LC.deadlines.statusOf(item);
        if (k === "bad") overdue++;
        else if (k === "warn") soon++;
      });
      setTile("s-over", overdue, overdue ? "bad" : "ok");
      setTile("s-soon", soon, soon ? "warn" : "ok");
    }

    if (S.day && S.date === U.todayStr()) {
      const readings = S.day.temps.length;
      const fails = S.day.temps.filter((t) => !t.ok).length;
      setTile("s-log", readings, fails ? "bad" : readings ? "ok" : "");
      $("s-log").querySelector(".l").textContent = fails ? `${fails} out of range today` : "Readings logged today";
    }

    const { percent } = LC.inspection.count();
    setTile("s-ready", `${percent}%`, percent >= 90 ? "ok" : percent >= 60 ? "warn" : "bad");
  }

  LC.render = function render() {
    renderChrome();
    renderSummary();
    LC.features.forEach((f) => f.render());
  };

  /* ---------- Save status pill ---------- */

  LC.api.onStatus(({ saving, offline }) => {
    const pill = $("modepill");
    pill.textContent = offline ? "Can't reach the server" : saving ? "Saving…" : "All changes saved";
    pill.className = `modepill${offline ? " local" : ""}`;
  });

  /* ---------- Tabs ---------- */

  const tabs = Array.from(document.querySelectorAll('nav.tabs [role="tab"]')).filter((t) => !t.hidden);
  const tabNames = tabs.map((t) => t.dataset.tab);

  LC.setTab = function setTab(name) {
    const tab = tabNames.includes(name) ? name : "today";
    S.tab = tab;
    tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    tabNames.forEach((t) => ($(`p-${t}`).hidden = t !== tab));
    history.replaceState(null, "", `#${tab}`);
    U.storage.set("ui:tab", tab);
  };

  tabs.forEach((b) => b.addEventListener("click", () => LC.setTab(b.dataset.tab)));
  document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => LC.setTab(b.dataset.go)));

  /* ---------- Delegated actions: <el data-act="name"> → LC.actions[name] ---------- */

  LC.actions.logout = async () => {
    await LC.api.post("/auth/logout").catch(() => {});
    location.href = "/";
  };

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const handler = LC.actions[el.dataset.act];
    if (handler) handler(el, ev);
  });

  /* ---------- Boot ---------- */

  U.bindToast();
  LC.setTab(location.hash.slice(1) || U.storage.get("ui:tab", "") || "today");
  document.body.classList.remove("booting");
  LC.render();
  store.start();

  // Pick up teammates' changes while the page is open and visible.
  setInterval(() => {
    if (document.visibilityState === "visible") store.refresh();
  }, 30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") store.refresh();
  });
})((window.LineCheck = window.LineCheck || {}));
