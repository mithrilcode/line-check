/** New-password form reached from the emailed reset link. */
(function () {
  "use strict";
  const F = window.LineCheckForms;
  const form = document.getElementById("reset");
  const errorBox = document.getElementById("form-error");
  const token = F.token();

  if (!token) {
    F.showMessage(errorBox, "This page needs the link from your reset email. Ask for a new one on the log-in page.");
    form.querySelector("button[type=submit]").disabled = true;
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!F.validate(form)) return;
    if (form.password.value !== form.confirm.value) {
      form.confirm.setCustomValidity("The passwords don't match.");
      form.confirm.reportValidity();
      form.confirm.setCustomValidity("");
      return;
    }
    F.showMessage(errorBox, "");
    const res = await F.busy(form, "Saving…", () => F.post("/auth/reset", { token, password: form.password.value }));
    if (!res.ok) {
      F.showMessage(errorBox, res.data.error || "We couldn't save your password. Try again.");
      return;
    }
    location.href = res.data.signedIn ? "/app.html" : "/login.html";
  });
})();
