/**
 * Settings: your account and password for everyone; reminder emails, the
 * calendar feed, restaurant details and team management for owners and managers.
 */
(function (LC) {
  "use strict";
  const U = LC.utils;
  const { $, esc } = U;
  const S = LC.state;
  const store = LC.store;
  const api = LC.api;

  const ROLE_NAMES = { owner: "Owner", manager: "Manager", staff: "Staff" };
  const STATE_NAMES = { CA: "California", TX: "Texas" };
  const isOwner = S.role === "owner";

  const view = { team: null, calendarUrl: "", armed: null, lastInvite: null };

  /* ---------- Show only what this role can use ---------- */

  if (!S.canManage) document.querySelectorAll("#p-settings [data-manager-only]").forEach((el) => el.remove());

  /* ---------- Your account ---------- */

  function fillAccount() {
    $("account-email").textContent = `Signed in as ${S.user.email}`;
    $("a-name").value = S.user.name || "";
    $("a-title").value = S.user.title || "";
    $("a-phone").value = S.user.phone || "";
    if ($("a-reminders")) $("a-reminders").checked = S.user.emailReminders !== false;
  }

  async function saveAccount(fields, message) {
    const user = await store.attempt(() => api.patch("/account", fields));
    if (!user) return;
    S.user = { ...S.user, ...user };
    $("user-name").textContent = S.user.name;
    if (message) U.toast(message);
  }

  $("f-account").addEventListener("submit", (ev) => {
    ev.preventDefault();
    saveAccount({ name: $("a-name").value.trim(), title: $("a-title").value.trim(), phone: $("a-phone").value.trim() }, "Account saved.");
  });

  $("f-password").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if ($("pw-next").value !== $("pw-confirm").value) {
      $("pw-confirm").setCustomValidity("The passwords don't match.");
      $("pw-confirm").reportValidity();
      $("pw-confirm").setCustomValidity("");
      return;
    }
    const done = await store.attempt(() => api.post("/account/password", { current: $("pw-current").value, next: $("pw-next").value }));
    if (done) {
      $("f-password").reset();
      U.toast("Password changed. Other devices have been signed out.");
    }
  });

  /* ---------- Managers: reminders, calendar, restaurant, team ---------- */

  if (S.canManage) {
    $("a-reminders").addEventListener("change", (ev) =>
      saveAccount({ emailReminders: ev.target.checked }, ev.target.checked ? "Reminder emails turned on." : "Reminder emails turned off.")
    );

    $("f-restaurant").addEventListener("submit", (ev) => {
      ev.preventDefault();
      store.updateRestaurant({
        name: $("r-name").value.trim(),
        address: $("r-address").value.trim(),
        city: $("r-city").value.trim(),
        county: $("r-county").value.trim(),
        zip: $("r-zip").value.trim(),
        phone: $("r-phone").value.trim(),
        permitNumber: $("r-permit").value.trim(),
        servesAlcohol: $("r-alcohol").checked,
      }).then(() => U.toast("Restaurant details saved."));
    });

    $("inv-role").innerHTML =
      '<option value="staff">Staff: daily log, deadlines and inspection prep</option>' +
      (isOwner ? '<option value="manager">Manager: also employee files, team and settings</option>' : "");
    $("team-intro").textContent = isOwner
      ? "Invite managers and staff. Managers can open employee files and invite staff; staff can use the daily log, deadlines and inspection prep."
      : "Invite staff to use the daily log, deadlines and inspection prep. Only the owner can add managers or change roles.";

    $("f-invite").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const email = $("inv-email").value.trim();
      const result = await store.attempt(() => api.post("/team/invites", { email, role: $("inv-role").value }));
      if (!result) return;
      $("inv-email").value = "";
      view.lastInvite = result;
      await loadTeam();
      U.toast(result.emailed ? `Invitation emailed to ${email}.` : `Invitation created for ${email}. Copy the link below to send it.`);
    });
  }

  function fillRestaurant() {
    if (!$("f-restaurant")) return;
    const r = S.restaurant;
    $("restaurant-state").textContent = `Uses the ${STATE_NAMES[r.state]} rules. The state can't be changed.`;
    $("r-name").value = r.name || "";
    $("r-address").value = r.address || "";
    $("r-city").value = r.city || "";
    $("r-county").value = r.county || "";
    $("r-zip").value = r.zip || "";
    $("r-phone").value = r.phone || "";
    $("r-permit").value = r.permitNumber || "";
    $("r-alcohol").checked = Boolean(r.servesAlcohol);
  }

  async function loadTeam() {
    view.team = await api.get("/team");
    render();
  }

  async function loadCalendar() {
    view.calendarUrl = (await api.get("/calendar")).url;
    render();
  }

  /* ---------- Render ---------- */

  function armedButton(key, label, confirmLabel, cls = "") {
    const armed = view.armed === key;
    return `<button type="button" class="btn small${armed ? " danger" : ""} ${cls}" data-act="settings-arm" data-key="${esc(key)}">${armed ? confirmLabel : label}</button>`;
  }

  function memberRow(m) {
    const canChangeRole = isOwner && m.role !== "owner";
    const canRemove = m.role !== "owner" && !m.isYou && (isOwner || m.role === "staff");
    const role = canChangeRole
      ? `<select data-role-for="${esc(m.userId)}" aria-label="Role for ${esc(m.name)}">
          <option value="manager"${m.role === "manager" ? " selected" : ""}>Manager</option>
          <option value="staff"${m.role === "staff" ? " selected" : ""}>Staff</option></select>`
      : `<span class="chip ${m.role === "owner" ? "ok" : "mute"}">${ROLE_NAMES[m.role]}</span>`;
    return `<tr><td><b>${esc(m.name)}</b>${m.isYou ? ' <span class="sub">(you)</span>' : ""}${m.title ? `<div class="sub">${esc(m.title)}</div>` : ""}</td>
      <td class="wrap-any">${esc(m.email)}</td><td>${role}</td>
      <td>${canRemove ? armedButton(`remove:${m.userId}`, "Remove", "Confirm remove") : ""}</td></tr>`;
  }

  function inviteRow(i) {
    const expires = i.expired ? '<span class="chip bad">Expired</span>' : `<span class="sub">Expires ${esc(U.fmtDate(i.expiresAt.slice(0, 10)))}</span>`;
    const canTouch = isOwner || i.role === "staff";
    return `<div class="list-row"><span class="min0 wrap-any"><b>${esc(i.email)}</b> <span class="chip mute">${ROLE_NAMES[i.role]}</span></span>
      ${expires}<span class="spacer"></span>
      ${canTouch ? `<button type="button" class="btn small" data-act="invite-resend" data-id="${esc(i.id)}">${i.expired ? "Send a new link" : "Resend"}</button>
      ${armedButton(`revoke:${i.id}`, "Revoke", "Confirm revoke")}` : ""}</div>`;
  }

  function render() {
    fillAccountOnce();
    if (!S.canManage) return;

    if (view.calendarUrl && document.activeElement !== $("cal-url")) $("cal-url").value = view.calendarUrl;
    $("cal-reset").innerHTML = view.calendarUrl ? armedButton("calendar", "Make a new link", "Old link stops working. Continue?") : "";

    if (!view.team) {
      $("team-members").innerHTML = '<div class="empty">Loading your team…</div>';
      return;
    }
    $("email-note").hidden = view.team.emailConfigured;
    $("team-members").innerHTML = `<table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
      <tbody>${view.team.members.map(memberRow).join("")}</tbody></table>`;

    const last = view.lastInvite;
    $("invite-result").innerHTML = last
      ? `<div class="banner">${last.emailed ? `We emailed an invitation to <b>${esc(last.email)}</b>. You can also send them this link:` : `Email isn't set up on this server, so send <b>${esc(last.email)}</b> this link yourself:`}
          <div class="row nowrap"><input id="invite-link" type="text" readonly value="${esc(last.link)}" aria-label="Invitation link"><button type="button" class="btn small" data-act="copy-invite">Copy</button></div>
          <span class="sub">It works once and expires in 7 days.</span></div>`
      : "";

    $("team-invites").innerHTML = view.team.invites.length
      ? `<h3>Waiting to join</h3><div class="checks">${view.team.invites.map(inviteRow).join("")}</div>`
      : "";
  }

  let accountFilled = false;
  function fillAccountOnce() {
    if (accountFilled) return;
    accountFilled = true;
    fillAccount();
    fillRestaurant();
  }

  /* ---------- Role changes (select elements) ---------- */

  document.addEventListener("change", async (ev) => {
    const userId = ev.target.dataset && ev.target.dataset.roleFor;
    if (!userId) return;
    const role = ev.target.value;
    if ((await store.attempt(() => api.patch(`/team/members/${userId}`, { role }))) !== undefined) {
      U.toast(`Role changed to ${ROLE_NAMES[role].toLowerCase()}.`);
    }
    await store.attempt(loadTeam);
  });

  /* ---------- Actions ---------- */

  function copy(inputId, label) {
    const input = $(inputId);
    const done = () => U.toast(`${label} copied.`);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(input.value).then(done, () => {
        input.select();
        U.toast("Press Ctrl+C (or ⌘C) to copy.");
      });
    } else {
      input.select();
      U.toast("Press Ctrl+C (or ⌘C) to copy.");
    }
  }

  Object.assign(LC.actions, {
    "copy-cal": () => copy("cal-url", "Calendar link"),
    "copy-invite": () => copy("invite-link", "Invitation link"),

    async "invite-resend"(el) {
      const result = await store.attempt(() => api.post(`/team/invites/${el.dataset.id}/resend`));
      if (!result) return;
      view.lastInvite = result;
      await store.attempt(loadTeam);
      U.toast(result.emailed ? `New link emailed to ${result.email}.` : "New link ready. Copy it below.");
    },

    /** Two-step buttons: the first click arms, the second acts. */
    async "settings-arm"(el) {
      const key = el.dataset.key;
      if (view.armed !== key) {
        view.armed = key;
        render();
        return;
      }
      view.armed = null;
      const [kind, id] = key.split(":");
      if (kind === "calendar") {
        const res = await store.attempt(() => api.post("/calendar/reset"));
        if (res) {
          view.calendarUrl = res.url;
          U.toast("New calendar link made. Update any calendars that used the old one.");
        }
        render();
      } else if (kind === "remove") {
        if ((await store.attempt(() => api.del(`/team/members/${id}`))) !== undefined) U.toast("Removed from the team.");
        await store.attempt(loadTeam);
      } else if (kind === "revoke") {
        if ((await store.attempt(() => api.del(`/team/invites/${id}`))) !== undefined) U.toast("Invitation revoked.");
        if (view.lastInvite && view.lastInvite.id === id) view.lastInvite = null;
        await store.attempt(loadTeam);
      }
    },
  });

  async function start() {
    render();
    if (S.canManage) await Promise.all([store.attempt(loadTeam), store.attempt(loadCalendar)]);
  }

  LC.features.push({ id: "settings", start, render });
})((window.LineCheck = window.LineCheck || {}));
