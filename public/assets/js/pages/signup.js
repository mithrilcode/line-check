/**
 * Sign-up: a three-step form (state → about you → restaurant) that creates
 * the account, the restaurant and a login session in one request.
 */
(function () {
  "use strict";

  const form = document.getElementById("signup");
  const steps = Array.from(form.querySelectorAll(".step"));
  const errorBox = document.getElementById("form-error");
  const back = document.getElementById("back");
  const next = document.getElementById("next");
  const dots = Array.from(form.querySelectorAll(".progress li"));
  let current = 0;

  function show(index) {
    current = index;
    steps.forEach((step, i) => (step.hidden = i !== index));
    dots.forEach((dot, i) => dot.classList.toggle("on", i <= index));
    document.getElementById("step-label").textContent = `Step ${index + 1} of ${steps.length}`;
    document.getElementById("step-title").textContent = steps[index].dataset.title;
    back.hidden = index === 0;
    next.textContent = index === steps.length - 1 ? "Create profile" : "Continue";
    errorBox.hidden = true;
    const first = steps[index].querySelector("input, select");
    if (first && index > 0) first.focus();
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  /** Checks the visible step's fields. Returns true when they're all valid. */
  function validStep() {
    const step = steps[current];
    if (current === 0 && !form.state.value) {
      showError("Choose the state your restaurant is in.");
      return false;
    }
    const fields = Array.from(step.querySelectorAll("input, select"));
    const invalid = fields.find((f) => !f.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    if (current === 1 && form.password.value !== form.confirm.value) {
      form.confirm.setCustomValidity("The passwords don't match.");
      form.confirm.reportValidity();
      form.confirm.setCustomValidity("");
      return false;
    }
    return true;
  }

  back.addEventListener("click", () => show(current - 1));

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!validStep()) return;
    if (current < steps.length - 1) {
      show(current + 1);
      return;
    }

    const f = form.elements;
    const body = {
      state: form.state.value,
      user: {
        name: f.userName.value,
        title: f.title.value,
        phone: f.userPhone.value,
        email: f.email.value,
        password: f.password.value,
      },
      restaurant: {
        name: f.restaurantName.value,
        address: f.address.value,
        city: f.city.value,
        county: f.county.value,
        zip: f.zip.value,
        phone: f.restaurantPhone.value,
        permitNumber: f.permitNumber.value,
        servesAlcohol: f.servesAlcohol.checked,
      },
    };

    next.disabled = true;
    next.textContent = "Creating…";
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        location.href = "/app.html#deadlines";
        return;
      }
      const data = await res.json().catch(() => ({}));
      const message = data.error || "We couldn't create your profile. Try again.";
      // Send people back to the step that has the problem.
      if (res.status === 409 || /email|password|your name/i.test(message)) show(1);
      showError(message);
    } catch {
      showError("Can't reach the server. Check your connection and try again.");
    } finally {
      next.disabled = false;
      next.textContent = current === steps.length - 1 ? "Create profile" : "Continue";
    }
  });

  show(0);
})();
