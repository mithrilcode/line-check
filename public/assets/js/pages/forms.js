/**
 * Shared helpers for the public pages (sign-up, log-in, password reset, invitations).
 * Exposed as window.LineCheckForms.
 */
(function () {
  "use strict";

  /** Calls the API and resolves { ok, status, data }. Network failures resolve with status 0. */
  async function request(method, path, body) {
    try {
      const res = await fetch(`/api${path}`, {
        method,
        credentials: "same-origin",
        headers: body ? { "Content-Type": "application/json", "X-Requested-With": "fetch" } : { "X-Requested-With": "fetch" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: { error: "Can't reach the server. Check your connection and try again." } };
    }
  }

  /** Reports the first invalid field in `form`; returns true when everything is valid. */
  function validate(form) {
    const invalid = Array.from(form.elements).find((f) => f.willValidate && !f.checkValidity());
    if (invalid) invalid.reportValidity();
    return !invalid;
  }

  function showMessage(box, message) {
    box.textContent = message;
    box.hidden = !message;
  }

  /** Disables the submit button while `work` runs. */
  async function busy(form, label, work) {
    const button = form.querySelector("button[type=submit]");
    const original = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try {
      return await work();
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  window.LineCheckForms = {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body || {}),
    validate,
    showMessage,
    busy,
    /** Reads ?token= from the page URL. */
    token: () => new URLSearchParams(location.search).get("token") || "",
  };
})();
