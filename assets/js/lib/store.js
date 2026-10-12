/**
 * App state and persistence.
 *
 * Inside a claude.ai artifact the page gets the `db` capability and every record is
 * shared with the team in real time. Anywhere else (a local file, GitHub Pages) the
 * same calls fall back to this browser's localStorage.
 *
 * Exposed as LineCheck.state (plain data) and LineCheck.store (functions and
 * capability handles). Also sets up the registries features plug into:
 * LineCheck.features, LineCheck.actions and LineCheck.deadlineSources.
 */
(function (LC) {
  "use strict";
  const U = LC.utils;

  LC.features = []; // { render() , start?() } — rendered on every state change
  LC.actions = {}; // data-act name → handler(element, event)
  LC.deadlineSources = []; // () => derived deadline rows (e.g. from employee files)

  const DEFAULT_UNITS = [
    { id: "walkin", name: "Walk-in cooler", kind: "cold" },
    { id: "reachin", name: "Reach-in, line", kind: "cold" },
    { id: "freezer", name: "Walk-in freezer", kind: "freezer" },
    { id: "steam", name: "Steam table", kind: "hot" },
  ];
  const defaultSettings = () => ({ units: U.clone(DEFAULT_UNITS), name: "", county: "" });
  const defaultPrep = () => ({ ticks: {} });
  const blankDay = (date) => ({ date, temps: [], cooling: [], checks: {} });

  const state = {
    mode: "connecting", // "connecting" | "db" | "local"
    tab: "today",
    items: [],
    itemsLoaded: false,
    date: U.todayStr(),
    day: null,
    prep: defaultPrep(),
    settings: defaultSettings(),
  };

  const store = {
    db: null, // claude.use("db") namespace, or null in local mode
    downloads: null, // claude.use("downloads"), or null when files can't be saved
    assets: null, // claude.use("assets"), or null when uploads aren't available
    canManage: null, // true/false once known; null when the platform didn't say
  };

  const subs = {};
  const chains = {};
  const render = () => LC.render();

  /** Serializes writes per key so two saves to one document never overlap. */
  function chain(key, fn) {
    const p = (chains[key] || Promise.resolve()).then(fn);
    chains[key] = p.catch(() => {});
    return p;
  }

  function onDbError(e) {
    if (e && e.code === "revoked") state.mode = "local";
    render();
  }

  /** Replaces or inserts a record in a list by id. */
  const upsert = (list, id, data) => list.filter((x) => x.id !== id).concat([{ ...U.clone(data), id }]);

  /* ---------- Collections (one document per record) ---------- */

  function watchCollection(name, onChange) {
    if (subs[name]) {
      subs[name]();
      subs[name] = null;
    }
    if (state.mode === "db") {
      subs[name] = store.db
        .collection(name)
        .onSnapshot((snap) => onChange(snap.docs.map((d) => ({ ...U.clone(d.data()), id: d.id }))), onDbError);
    } else {
      const all = U.storage.get(name, {});
      onChange(Object.keys(all).map((id) => ({ ...all[id], id })));
    }
  }

  function putDoc(name, id, data, onError = U.showError) {
    const body = U.clone(data);
    delete body.id;
    if (state.mode === "db") {
      return chain(`${name}/${id}`, () => store.db.doc(`${name}/${id}`).set(body)).catch(onError);
    }
    const all = U.storage.get(name, {});
    all[id] = body;
    U.storage.set(name, all);
    return Promise.resolve();
  }

  function deleteDoc(name, id, onError = U.showError) {
    if (state.mode === "db") {
      return chain(`${name}/${id}`, () => store.db.doc(`${name}/${id}`).delete()).catch(onError);
    }
    const all = U.storage.get(name, {});
    delete all[id];
    U.storage.set(name, all);
    return Promise.resolve();
  }

  /* ---------- Deadlines ---------- */

  function watchItems() {
    watchCollection("items", (list) => {
      state.items = list;
      state.itemsLoaded = true;
      render();
    });
  }

  function putItem(id, data) {
    state.items = upsert(state.items, id, data);
    render();
    return putDoc("items", id, data);
  }

  function deleteItem(id) {
    state.items = state.items.filter((x) => x.id !== id);
    render();
    return deleteDoc("items", id);
  }

  /* ---------- Daily log (one document per date) ---------- */

  function watchDay() {
    if (subs.day) {
      subs.day();
      subs.day = null;
    }
    const date = state.date;
    state.day = null;
    if (state.mode === "db") {
      subs.day = store.db.doc(`days/${date}`).onSnapshot((snap) => {
        if (date !== state.date) return;
        state.day = snap.exists ? U.clone(snap.data()) : blankDay(date);
        render();
      }, onDbError);
    } else {
      state.day = U.storage.get(`day:${date}`, null) || blankDay(date);
    }
  }

  function setDate(date) {
    state.date = date;
    watchDay();
    render();
  }

  function mutateDay(fn) {
    const date = state.date;
    return chain(`day:${date}`, () => {
      const current = U.clone(state.date === date && state.day ? state.day : blankDay(date));
      fn(current);
      current.date = date;
      if (state.date === date) {
        state.day = current;
        render();
      }
      if (state.mode === "db") return store.db.doc(`days/${date}`).set(current);
      U.storage.set(`day:${date}`, current);
      return undefined;
    }).catch(U.showError);
  }

  /** Most recent daily logs, newest first in db mode; unordered locally. */
  function readDays(limit = 120) {
    if (state.mode === "db") {
      return store.db
        .collection("days")
        .orderBy("date", "desc")
        .limit(limit)
        .get()
        .then((snap) => snap.docs.map((d) => d.data()));
    }
    const days = U.storage
      .keys()
      .filter((k) => k.startsWith("day:"))
      .map((k) => U.storage.get(k, null))
      .filter(Boolean);
    return Promise.resolve(days);
  }

  /* ---------- Single documents (settings, inspection walkthrough) ---------- */

  function watchDoc(path, key, fallback) {
    if (state.mode === "db") {
      subs[key] = store.db.doc(path).onSnapshot((snap) => {
        if (snap.exists) state[key] = { ...fallback(), ...U.clone(snap.data()) };
        render();
      }, onDbError);
    } else {
      const saved = U.storage.get(key, null);
      if (saved) state[key] = { ...fallback(), ...saved };
    }
  }

  function mutateDoc(path, key, fn) {
    return chain(key, () => {
      const current = U.clone(state[key]);
      fn(current);
      state[key] = current;
      render();
      if (state.mode === "db") return store.db.doc(path).set(current);
      U.storage.set(key, current);
      return undefined;
    }).catch(U.showError);
  }

  const mutateSettings = (fn) => mutateDoc("settings/main", "settings", fn);
  const mutatePrep = (fn) => mutateDoc("prep/current", "prep", fn);

  function start() {
    watchItems();
    watchDay();
    watchDoc("prep/current", "prep", defaultPrep);
    watchDoc("settings/main", "settings", defaultSettings);
    LC.features.forEach((f) => f.start && f.start());
  }

  LC.state = state;
  Object.assign(store, {
    start, chain, upsert, watchCollection, putDoc, deleteDoc,
    putItem, deleteItem, setDate, mutateDay, readDays, mutateSettings, mutatePrep,
  });
  LC.store = store;
})((window.LineCheck = window.LineCheck || {}));
