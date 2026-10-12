/**
 * Inspection prep: a self-inspection walkthrough with a readiness score.
 */
(function (LC) {
  "use strict";
  const U = LC.utils;
  const { $, esc } = U;
  const S = LC.state;
  const store = LC.store;

  let resetArmed = false;

  function count() {
    const ticks = S.prep.ticks || {};
    let total = 0;
    let done = 0;
    LC.config.inspection.forEach((section) =>
      section.items.forEach((item) => {
        total++;
        if (ticks[item.id]) done++;
      })
    );
    return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  function render() {
    const { total, done, percent } = count();
    const ticks = S.prep.ticks || {};
    const text = LC.config.text;

    $("prep-meter").style.width = `${percent}%`;
    $("prep-score").textContent = `${done} of ${total} ready (${percent}%)`;
    $("prep-when").textContent = S.prep.started ? `Walkthrough started ${U.fmtDate(S.prep.started)}` : "";

    if (!done) $("prep-reset").innerHTML = "";
    else if (resetArmed) {
      $("prep-reset").innerHTML = `<span class="sub">Clear every tick?</span>
        <button class="btn small danger" data-act="reset-prep">Yes, start over</button>
        <button class="btn small" data-act="reset-cancel">Keep</button>`;
    } else {
      $("prep-reset").innerHTML = '<button class="btn small" data-act="reset-arm">Start a new walkthrough</button>';
    }

    const open = [];
    LC.config.inspection.forEach((s) => s.items.forEach((i) => i.priority && !ticks[i.id] && open.push(i)));
    $("prep-open").innerHTML = open.length
      ? `<div class="banner warn"><b>${U.plural(open.length, `${text.priorityLabel.toLowerCase()} item`)} not yet confirmed.</b> Fix these before anything else.</div>`
      : `<div class="banner">${esc(text.priorityAllDone)}</div>`;

    $("prep-secs").innerHTML = LC.config.inspection
      .map((section) => {
        const sectionDone = section.items.filter((i) => ticks[i.id]).length;
        return `<div class="card">
          <div class="row"><h2>${esc(section.title)}</h2><span class="spacer"></span>
            <span class="chip ${sectionDone === section.items.length ? "ok" : "mute"}">${sectionDone}/${section.items.length}</span></div>
          <div class="checks">${section.items
            .map((item) => {
              const on = ticks[item.id];
              return `<label class="check${on ? " done" : ""}">
                <input type="checkbox" data-act="prep" data-id="${esc(item.id)}"${on ? " checked" : ""}>
                <span><span class="t">${esc(item.text)}</span>${item.priority ? `<span class="major">${esc(text.priorityLabel)}</span>` : ""}${item.cite ? `<span class="cite">${esc(item.cite)}</span>` : ""}</span>
                <span class="when">${on ? esc(U.fmtShortDate(on)) : ""}</span></label>`;
            })
            .join("")}</div></div>`;
      })
      .join("");
  }

  Object.assign(LC.actions, {
    prep(el) {
      const id = el.dataset.id;
      const on = el.checked;
      store.mutatePrep((p) => {
        p.ticks = p.ticks || {};
        if (on) p.ticks[id] = U.todayStr();
        else delete p.ticks[id];
        if (!p.started) p.started = U.todayStr();
      });
    },
    "reset-arm"() {
      resetArmed = true;
      render();
    },
    "reset-cancel"() {
      resetArmed = false;
      render();
    },
    "reset-prep"() {
      resetArmed = false;
      store.mutatePrep((p) => {
        p.ticks = {};
        p.started = U.todayStr();
      });
      U.toast("New walkthrough started.");
    },
  });

  LC.features.push({ id: "inspection", render });
  LC.inspection = { count };
})((window.LineCheck = window.LineCheck || {}));
