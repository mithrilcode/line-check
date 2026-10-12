/**
 * Entry point: renders the summary strip, wires tabs and the shared
 * click-action dispatcher, connects to the artifact runtime, and starts the store.
 * Load this last.
 */
(function (LC) {
  "use strict";
  const U = LC.utils;
  const { $ } = U;
  const S = LC.state;
  const store = LC.store;

  /* ---------- Summary strip & page chrome ---------- */

  function setTile(id, value, cls) {
    const el = $(id);
    el.querySelector(".n").textContent = value;
    el.className = `tile ${cls || ""}`;
  }

  function renderChrome() {
    const pill = $("modepill");
    pill.textContent = { db: "Synced for your team", local: "Saved on this device only" }[S.mode] || "Connecting…";
    pill.className = `modepill${S.mode === "local" ? " local" : ""}`;
    if (document.activeElement !== $("bizname")) $("bizname").value = S.settings.name || "";
    if (document.activeElement !== $("county")) $("county").value = S.settings.county || "";
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

  /* ---------- Tabs ---------- */

  const tabs = Array.from(document.querySelectorAll('nav.tabs [role="tab"]'));
  const tabNames = tabs.map((t) => t.dataset.tab);

  LC.setTab = function setTab(name) {
    const tab = tabNames.includes(name) ? name : "today";
    S.tab = tab;
    tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    tabNames.forEach((t) => ($(`p-${t}`).hidden = t !== tab));
    try {
      history.replaceState(null, "", `#${tab}`);
    } catch {
      /* Some embedded views block history changes. */
    }
    U.storage.set("ui:tab", tab);
  };

  tabs.forEach((b) => b.addEventListener("click", () => LC.setTab(b.dataset.tab)));
  document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => LC.setTab(b.dataset.go)));

  /* ---------- Delegated actions: <el data-act="name"> → LC.actions[name] ---------- */

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const handler = LC.actions[el.dataset.act];
    if (handler) handler(el, ev);
  });

  /* ---------- Artifact runtime ---------- */

  async function connect() {
    const claude = window.claude;
    if (!claude || typeof claude.use !== "function") return;
    try {
      store.db = await claude.use("db");
    } catch {
      store.db = null;
    }
    claude
      .use("downloads")
      .then((d) => {
        store.downloads = d;
        LC.render();
      })
      .catch(() => {});
    if (LC.config.employees) {
      claude
        .use("assets")
        .then((a) => {
          store.assets = a;
          LC.render();
        })
        .catch(() => {});
      try {
        const user = await claude.use("user");
        if (user) store.canManage = await user.canEdit();
      } catch {
        /* Unknown: the employee module finds out from its first write. */
      }
    }
  }

  /* ---------- Boot ---------- */

  U.bindToast();
  LC.setTab(location.hash.slice(1) || U.storage.get("ui:tab", "") || "today");
  LC.render();
  connect().then(() => {
    S.mode = store.db ? "db" : "local";
    if (S.mode === "local") store.canManage = true;
    store.start();
    LC.render();
  });
})((window.LineCheck = window.LineCheck || {}));
