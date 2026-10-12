/**
 * Accepting a team invitation. The form adapts to three cases:
 * already signed in as the invited email, an existing account (password), or a new account.
 */
(function () {
  "use strict";
  const F = window.LineCheckForms;
  const $ = (id) => document.getElementById(id);
  const form = $("accept");
  const errorBox = $("form-error");
  const token = F.token();
  let mode = "new"; // "new" | "existing" | "signed-in"

  function invalid(reason) {
    $("loading").hidden = true;
    $("invalid-reason").textContent = reason;
    $("invalid").hidden = false;
  }

  /** Marks the visible section's fields required and the hidden one's optional. */
  function setRequired(section, on) {
    section.querySelectorAll("input:not([readonly])").forEach((i) => (i.required = on));
  }

  async function load() {
    if (!token) return invalid("The link is missing its code. Open it straight from the invitation email.");
    const res = await F.get(`/invites/${encodeURIComponent(token)}`);
    if (!res.ok) return invalid(res.data.error || "We couldn't load this invitation.");

    const invite = res.data;
    $("invite-role").textContent = invite.role === "manager" ? "Manager invitation" : "Team invitation";
    $("invite-title").textContent = `Join ${invite.restaurantName}`;
    $("invite-intro").textContent = `${invite.invitedBy || "Your manager"} invited ${invite.email} to use Line Check for ${invite.restaurantName}.`;
    $("invite-email-new").value = invite.email;
    $("invite-email-existing").value = invite.email;

    if (invite.signedInAs && invite.signedInAs.toLowerCase() === invite.email.toLowerCase()) {
      mode = "signed-in";
      $("signed-in").textContent = `You're signed in as ${invite.signedInAs}.`;
      $("signed-in").hidden = false;
    } else if (invite.hasAccount) {
      mode = "existing";
      $("existing-account").hidden = false;
      setRequired($("existing-account"), true);
    } else {
      mode = "new";
      $("new-account").hidden = false;
      setRequired($("new-account"), true);
      $("accept-button").textContent = "Create account and join";
    }
    $("loading").hidden = true;
    form.hidden = false;
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!F.validate(form)) return;
    let body = {};
    if (mode === "new") {
      if (form.password.value !== form.confirm.value) {
        form.confirm.setCustomValidity("The passwords don't match.");
        form.confirm.reportValidity();
        form.confirm.setCustomValidity("");
        return;
      }
      body = { name: form.elements.name.value, password: form.password.value };
    } else if (mode === "existing") {
      body = { password: form.existingPassword.value };
    }
    F.showMessage(errorBox, "");
    const res = await F.busy(form, "Joining…", () => F.post(`/invites/${encodeURIComponent(token)}/accept`, body));
    if (!res.ok) {
      F.showMessage(errorBox, res.data.error || "We couldn't accept the invitation. Try again.");
      return;
    }
    location.href = "/app.html";
  });

  load();
})();
