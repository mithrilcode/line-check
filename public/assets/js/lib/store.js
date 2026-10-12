/**
 * App state and the operations that change it. Every change goes to the API
 * first; the state is then updated from the server's answer and the page re-rendered.
 *
 * Exposed as LineCheck.state (plain data) and LineCheck.store (operations).
 * Also sets up the registries features plug into:
 * LineCheck.features, LineCheck.actions and LineCheck.deadlineSources.
 */
(function (LC) {
  "use strict";
  const U = LC.utils;
  const api = LC.api;

  LC.features = []; // { render(), start?(), refresh?() } — rendered on every state change
  LC.actions = {}; // data-act name → handler(element, event)
  LC.deadlineSources = []; // () => derived deadline rows (e.g. from employee files)

  const session = LC.session;
  const state = {
    tab: "today",
    user: session.user,
    restaurant: session.restaurant,
    role: session.role,
    canManage: session.role === "owner" || session.role === "manager",
    units: [],
    date: U.todayStr(),
    day: null,
    items: [],
    itemsLoaded: false,
    prep: { ticks: {}, started: "" },
  };

  const render = () => LC.render();

  /** Runs an API call, showing its error as a toast. Resolves undefined on failure. */
  async function attempt(fn) {
    try {
      return await fn();
    } catch (e) {
      U.toast(e.message || "Something went wrong. Try again.");
      return undefined;
    }
  }

  /* ---------- Loading ---------- */

  async function loadUnits() {
    state.units = await api.get("/units");
  }

  async function loadDay() {
    const date = state.date;
    const day = await api.get(`/days/${date}`);
    if (date === state.date) state.day = day;
  }

  async function loadDeadlines() {
    state.items = await api.get("/deadlines");
    state.itemsLoaded = true;
  }

  async function loadInspection() {
    state.prep = await api.get("/inspection");
  }

  async function start() {
    await attempt(() => Promise.all([loadUnits(), loadDay(), loadDeadlines(), loadInspection()]));
    render();
    await Promise.all(LC.features.map((f) => f.start && f.start()));
  }

  /** Picks up changes other people made (polled while the page is visible). */
  async function refresh() {
    try {
      await Promise.all([loadDay(), loadDeadlines(), loadInspection(), ...LC.features.map((f) => f.refresh && f.refresh())]);
      render();
    } catch {
      /* The header pill already shows when the server can't be reached. */
    }
  }

  /* ---------- Restaurant ---------- */

  async function updateRestaurant(fields) {
    const restaurant = await attempt(() => api.patch("/restaurant", fields));
    if (restaurant) {
      state.restaurant = restaurant;
      render();
    }
  }

  /* ---------- Today's log ---------- */

  async function setDate(date) {
    state.date = date;
    state.day = null;
    render();
    await attempt(loadDay);
    render();
  }

  /** Runs a change to the current day, then reloads that day. */
  async function changeDay(fn) {
    const ok = await attempt(fn);
    await attempt(loadDay);
    render();
    return ok;
  }

  const addReading = (entry) => changeDay(() => api.post(`/days/${state.date}/readings`, entry));
  const deleteReading = (id) => changeDay(() => api.del(`/readings/${id}`));
  const setShiftCheck = (id, checked) =>
    changeDay(() => api.put(`/days/${state.date}/checks/${encodeURIComponent(id)}`, { checked, at: U.nowHM() }));
  const addCooling = (batch) => changeDay(() => api.post(`/days/${state.date}/cooling`, batch));
  const logCooling = (id, step, v) => changeDay(() => api.patch(`/cooling/${id}`, { step, v, at: U.nowHM() }));
  const deleteCooling = (id) => changeDay(() => api.del(`/cooling/${id}`));

  async function addUnit(name, kind) {
    const unit = await attempt(() => api.post("/units", { name, kind }));
    if (unit) state.units = state.units.concat([unit]);
    render();
  }

  async function deleteUnit(id) {
    await attempt(() => api.del(`/units/${id}`));
    state.units = state.units.filter((u) => u.id !== id);
    render();
  }

  /** Recent days with entries, for the CSV export. */
  const readDays = (limit = 120) => api.get(`/logs?limit=${limit}`);

  /* ---------- Deadlines ---------- */

  async function changeDeadlines(fn) {
    const result = await attempt(fn);
    await attempt(loadDeadlines);
    render();
    return result;
  }

  const saveDeadline = (id, data) =>
    changeDeadlines(() => (id ? api.put(`/deadlines/${id}`, data) : api.post("/deadlines", data)));
  const deleteDeadline = (id) => changeDeadlines(() => api.del(`/deadlines/${id}`));
  const addDeadlines = (items) => changeDeadlines(() => api.post("/deadlines/bulk", { items }));

  /* ---------- Inspection ---------- */

  async function setInspectionTick(id, checked) {
    const prep = await attempt(() => api.put(`/inspection/ticks/${encodeURIComponent(id)}`, { checked, date: U.todayStr() }));
    if (prep) state.prep = prep;
    render();
  }

  async function resetInspection() {
    const prep = await attempt(() => api.post("/inspection/reset", { date: U.todayStr() }));
    if (prep) state.prep = prep;
    render();
  }

  LC.state = state;
  LC.store = {
    attempt, start, refresh, updateRestaurant,
    setDate, addReading, deleteReading, setShiftCheck, addCooling, logCooling, deleteCooling,
    addUnit, deleteUnit, readDays,
    saveDeadline, deleteDeadline, addDeadlines,
    setInspectionTick, resetInspection,
  };
})((window.LineCheck = window.LineCheck || {}));
