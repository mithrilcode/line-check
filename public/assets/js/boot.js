/**
 * Dashboard loader. Asks the API who is signed in, then loads the config for
 * their restaurant's state followed by the app scripts, in order.
 */
(async function () {
  "use strict";

  const STATE_CONFIGS = { CA: "california", TX: "texas" };
  const SCRIPTS = [
    "lib/utils.js",
    "lib/api.js",
    "lib/store.js",
    "features/daily-log.js",
    "features/deadlines.js",
    "features/inspection.js",
    "features/employees.js",
    "features/exports.js",
    "features/settings.js",
    "main.js",
  ];

  function fail(message) {
    const box = document.getElementById("boot-error");
    box.textContent = message;
    box.hidden = false;
    document.body.classList.remove("booting");
  }

  let session;
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (res.status === 401) {
      location.replace("/login.html");
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    session = await res.json();
  } catch {
    fail("Line Check can't reach the server right now. Check your connection and reload the page.");
    return;
  }

  window.LineCheck = window.LineCheck || {};
  window.LineCheck.session = session;

  const load = (src) =>
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `/assets/js/${src}`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(src));
      document.head.appendChild(script);
    });

  try {
    await load(`states/${STATE_CONFIGS[session.restaurant.state]}.js`);
    for (const src of SCRIPTS) await load(src);
  } catch {
    fail("Part of Line Check didn't load. Reload the page to try again.");
  }
})();
