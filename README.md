# Line Check

A compliance helper for small restaurants: a daily food safety log, a permit and renewal tracker, and a self-inspection walkthrough, each tuned to one state's food code.

| Page | Rules it follows |
| --- | --- |
| [`california.html`](california.html) | California Retail Food Code (CalCode) |
| [`texas.html`](texas.html) | Texas Food Establishment Rules (25 TAC Chapter 228) |

## Features

- **Today's log:** temperature, cooking, sanitizer and handwash-water readings, checked against the state limit as you type. An out-of-range reading needs a corrective action before it can be saved. Includes a cooling log (135°F → 70°F in 2 hours, → 41°F in 6 hours) and opening/closing checklists.
- **Permits & renewals:** health permit, manager and food handler certificates, hood cleaning, fire suppression, backflow, grease, pest control, and state tax and alcohol filings. "Mark renewed" rolls each item to its next due date. Exports to a CSV that Google Calendar can import.
- **Inspection prep:** a walkthrough modeled on how inspectors score, with the highest-risk items flagged.
- **Employees** (Texas): one file per employee with certifications, onboarding paperwork, write-ups, training and illness records, and attached scans. Expiring cards feed the renewals tracker.
- **Quick reference:** temperatures, sanitizer strengths, illness exclusions, closure triggers and agency links.

## Running it locally

There is no build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```sh
python -m http.server 8000
# then open http://localhost:8000
```

Outside claude.ai the pages save to the browser's `localStorage` (namespaced per state), and file uploads and CSV exports are hidden.

## Project structure

```
index.html                  Landing page: pick a state
california.html             California page (markup only)
texas.html                  Texas page (markup only, includes the Employees panel)
assets/
  css/
    line-check.css          All styles: tokens (light + dark), layout, components
  js/
    states/
      california.js         State config: limits, checklists, walkthrough, starter deadlines
      texas.js              Same, plus the employee-file rules (cert types, onboarding)
    lib/
      utils.js              DOM, escaping, date math, localStorage, toasts
      store.js              App state and persistence (artifact db or localStorage)
    features/
      daily-log.js          Readings, shift checks, cooling log, holding units
      deadlines.js          Permits & renewals list and edit dialog
      inspection.js         Self-inspection walkthrough and readiness score
      employees.js          Employee files (loads only where the state config enables it)
      exports.js            CSV exports
    main.js                 Summary strip, tabs, action dispatch, startup
```

### How the pieces fit

- Every script is a plain IIFE that attaches to one global, `window.LineCheck`, so the pages work straight from the file system with no bundler or module server. Load order matters and is set in each page's `<head>`: state config → `lib/` → `features/` → `main.js`.
- **State config is data, not code.** Everything that differs between states (limits, wording, checklists, starter deadlines, certification rules) lives in `assets/js/states/<state>.js`. The features read `LineCheck.config` and never mention a state by name.
- **Features register themselves.** Each feature pushes a `render()` (and optionally `start()`) onto `LineCheck.features` and adds its click handlers to `LineCheck.actions`. Buttons name their handler with `data-act="…"`, and `main.js` dispatches every click from one listener.
- **One render path.** Any state change calls `LineCheck.render()`, which redraws the summary strip and every feature. Regions with forms keep what the user is typing (`utils.keepInputs`).

### Adding a state

1. Copy `assets/js/states/texas.js` to `assets/js/states/<state>.js`, give it a new `id` and `name`, and replace the rules with that state's food code.
2. Copy `texas.html` to `<state>.html`, point its first `<script>` at the new config, and rewrite the Quick reference panel and footer.
3. Leave out the `employees` block and the Employees panel/script if you don't need employee files.
4. Add a card for it to `index.html`.

## Running as a claude.ai artifact

The pages were built to run as [claude.ai](https://claude.ai) artifacts, where they gain capabilities a static site doesn't have:

| Capability | Used for |
| --- | --- |
| `db` | Shared records for the whole team, synced live |
| `downloads` | CSV exports |
| `assets` | Photo and PDF attachments in employee files |
| `user` | Showing employee files only to managers |

The Texas artifact declares this access rule so employee files stay manager-only:

```json
{ "db": { "rules": [{ "path": "employees", "read": "admin", "write": "admin" }] } }
```

## Disclaimer

Counties and cities add their own rules and set their own permit terms and fees. Confirm requirements with your local health department. This tool helps you keep records; it isn't legal or tax advice.
