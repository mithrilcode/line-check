/** Log-in form. */
(function () {
  "use strict";

  const form = document.getElementById("login");
  const errorBox = document.getElementById("form-error");
  const button = form.querySelector("button[type=submit]");

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const invalid = Array.from(form.elements).find((f) => f.willValidate && !f.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }

    button.disabled = true;
    errorBox.hidden = true;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
        body: JSON.stringify({ email: form.email.value, password: form.password.value }),
      });
      if (res.ok) {
        location.href = "/app.html";
        return;
      }
      const data = await res.json().catch(() => ({}));
      errorBox.textContent = data.error || "We couldn't log you in. Try again.";
    } catch {
      errorBox.textContent = "Can't reach the server. Check your connection and try again.";
    }
    errorBox.hidden = false;
    button.disabled = false;
  });
})();
