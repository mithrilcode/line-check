/**
 * CSV exports: deadlines in Google Calendar's import format, and the daily logs.
 * Saving a file needs the artifact `downloads` capability; the buttons stay
 * hidden where it isn't available.
 */
(function (LC) {
  "use strict";
  const U = LC.utils;
  const store = LC.store;

  const csvCell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

  /** Google Calendar's CSV import expects MM/DD/YYYY. */
  const mdy = (s) => {
    const [y, m, d] = s.split("-");
    return `${m}/${d}/${y}`;
  };

  function save(filename, data) {
    if (!store.downloads) return;
    store.downloads
      .save({ filename, data })
      .then(() => U.toast(`Saved ${filename}.`))
      .catch((e) => {
        if (e && e.code === "declined") return;
        U.toast(e && e.code === "rate_limited" ? "A save is already waiting for you." : "Couldn't save the file here.");
      });
  }

  function exportCalendar() {
    const rows = [["Subject", "Start Date", "All Day Event", "Description"]];
    LC.deadlines.allItems().forEach((item) => {
      if (!item.due || item.done) return;
      rows.push([`${item.name} due`, mdy(item.due), "True", [item.agency, item.notes].filter(Boolean).join(". ")]);
      const reminder = U.addDays(item.due, -30);
      if (U.daysUntil(reminder) > 0) rows.push([`Reminder: ${item.name} due in 30 days`, mdy(reminder), "True", ""]);
    });
    if (rows.length < 2) {
      U.toast("Set due dates first, then export.");
      return;
    }
    save("line-check-deadlines.csv", toCsv(rows));
  }

  function exportLogs() {
    store
      .readDays()
      .then((days) => {
        days.sort((a, b) => (a.date < b.date ? -1 : 1));
        const rows = [["Date", "Time", "Type", "Check", "Reading", "Unit", "Result", "Initials", "Corrective action"]];
        days.forEach((d) => {
          (d.temps || [])
            .slice()
            .sort((a, b) => (a.at < b.at ? -1 : 1))
            .forEach((t) =>
              rows.push([d.date, t.at, "Temperature", t.what, t.value, t.unit, t.ok ? "Pass" : "Out of range", t.by, t.action])
            );
          (d.cooling || []).forEach((c) => {
            const reading =
              `start ${c.t0}` + (c.r2 ? ` / 2h ${c.r2.v} at ${c.r2.at}` : "") + (c.r6 ? ` / 6h ${c.r6.v} at ${c.r6.at}` : "");
            const result = c.r6 ? (c.r6.v <= 41 && c.r2 && c.r2.v <= 70 ? "Pass" : "Fail") : "Incomplete";
            rows.push([d.date, c.start, "Cooling", c.food, reading, "°F", result, c.by, ""]);
          });
        });
        if (rows.length < 2) {
          U.toast("No log entries to export yet.");
          return;
        }
        save(`line-check-logs-${U.todayStr()}.csv`, toCsv(rows));
      })
      .catch(U.showError);
  }

  Object.assign(LC.actions, {
    "export-cal": exportCalendar,
    "export-logs": exportLogs,
  });

  LC.features.push({
    id: "exports",
    render() {
      document.querySelectorAll("[data-act^='export-']").forEach((b) => (b.hidden = !store.downloads));
    },
  });
})((window.LineCheck = window.LineCheck || {}));
