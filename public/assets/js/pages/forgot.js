/** "Forgot your password?" form. */
(function () {
  "use strict";
  const F = window.LineCheckForms;
  const form = document.getElementById("forgot");
  const errorBox = document.getElementById("form-error");

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!F.validate(form)) return;
    F.showMessage(errorBox, "");
    const email = form.email.value.trim();
    const res = await F.busy(form, "Sending…", () => F.post("/auth/forgot", { email }));
    if (!res.ok) {
      F.showMessage(errorBox, res.data.error || "We couldn't send the link. Try again.");
      return;
    }
    document.getElementById("sent-to").textContent = email;
    form.hidden = true;
    document.getElementById("sent").hidden = false;
  });
})();
