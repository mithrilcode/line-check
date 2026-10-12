/** Landing page: point signed-in visitors at their dashboard instead of sign-up. */
(function () {
  "use strict";

  fetch("/api/auth/me", { credentials: "same-origin" })
    .then((res) => (res.ok ? res.json() : null))
    .then((me) => {
      if (!me) return;
      const swap = (id, text, href) => {
        const el = document.getElementById(id);
        el.textContent = text;
        el.href = href;
      };
      swap("nav-signup", "Open dashboard", "/app.html");
      swap("cta-primary", `Open ${me.restaurant.name}`, "/app.html");
      document.getElementById("nav-login").hidden = true;
      document.getElementById("cta-secondary").hidden = true;
    })
    .catch(() => {});
})();
