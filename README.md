# Line Check

A compliance helper for small restaurants: daily food safety logs, permit and renewal deadlines, a self-inspection walkthrough and employee files, each tuned to the restaurant's state food code.

Supported states: **California** (California Retail Food Code) and **Texas** (Texas Food Establishment Rules, 25 TAC Chapter 228).

## Features

- **Profiles:** sign up with a three-step form (state → about you → your restaurant). The state picks which food code, limits, checklists and starter deadlines the dashboard uses.
- **Today's log:** temperature, cooking, sanitizer and handwash-water readings, checked against the state limit as you type. Out-of-range readings need a corrective action before they save. Includes a cooling log (135°F → 70°F in 2 hours, → 41°F in 6 hours) and opening/closing checklists.
- **Permits & renewals:** health permit, manager and food handler certificates, hood cleaning, fire suppression, backflow, grease, pest control, and state tax and alcohol filings. "Mark renewed" rolls each item to its next due date. Exports to a CSV that Google Calendar can import.
- **Inspection prep:** a walkthrough modeled on how inspectors score, with the highest-risk items flagged.
- **Employee files** (owners and managers): certifications, onboarding paperwork, write-ups, training and illness records, with photo or PDF attachments. Expiring cards feed the renewals tracker.
- **Quick reference:** temperatures, sanitizer strengths, illness exclusions, closure triggers and agency links.

## Getting started

Requires **Node.js 22.13 or newer** (the database uses Node's built-in `node:sqlite`).

```sh
npm install
npm start
# open http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm start` | Runs the server |
| `npm run dev` | Runs the server and restarts it when files change |
| `npm test` | Runs the API test suite against a throwaway database |

### Configuration

Set these environment variables as needed:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `HOST` | `127.0.0.1` | Interface to listen on. Use `0.0.0.0` behind a reverse proxy or in a container. |
| `DATA_DIR` | `./data` | Where the SQLite database (`linecheck.db`) and uploaded files (`uploads/`) live |
| `NODE_ENV` | — | Set to `production` to mark the session cookie `Secure` (requires HTTPS) |

`data/` is git-ignored. Back it up: it holds every record and upload.

## Project structure

```
server/
  index.js              Entry point: opens the database, starts the HTTP server
  app.js                Express app: security headers, sessions, API routes, static files, errors
  db.js                 Opens SQLite and applies migrations
  auth.js               Password hashing, sessions, role checks, CSRF guard, login rate limit
  migrations/
    001_initial.sql     Database schema
  lib/
    validate.js         Request validation helpers and HttpError
    mappers.js          Database rows → API JSON
  routes/
    auth.js             Sign-up, log-in, log-out, current user
    restaurant.js       Restaurant profile
    daily-log.js        Holding units, readings, shift checks, cooling, log export
    deadlines.js        Permits & renewals
    inspection.js       Walkthrough ticks
    files.js            Uploads and downloads
    employees.js        Employee files and everything inside them
public/
  index.html            Landing page
  signup.html           Profile creation
  login.html            Log in
  app.html              Dashboard (requires a session)
  partials/             Per-state Quick reference panels
  assets/css/           Stylesheet (light and dark themes)
  assets/js/
    boot.js             Dashboard loader: checks the session, loads the state config and app scripts
    states/             Per-state rules: limits, checklists, starter deadlines, employee-file rules, page text
    lib/                utils.js, api.js (fetch client), store.js (state and operations)
    features/           daily-log, deadlines, inspection, employees, exports
    main.js             Summary strip, tabs, account menu, action dispatch, polling
    pages/              Landing, sign-up and log-in scripts
test/
  api.test.js           End-to-end API tests (node:test)
```

## Database

SQLite, one file. Every business table carries a `restaurant_id`, and every query is scoped to the signed-in user's restaurant.

| Table | Holds |
| --- | --- |
| `users` | Accounts (email, scrypt password hash, name, role title) |
| `restaurants` | Restaurant profile and state (`CA` or `TX`) |
| `memberships` | Which users belong to which restaurant, as `owner`, `manager` or `staff` |
| `sessions` | Login sessions (only a SHA-256 hash of the cookie token is stored) |
| `holding_units` | Coolers, freezers and hot wells that appear in the log |
| `readings` | Temperature, cooking and sanitizer readings with pass/fail and corrective action |
| `shift_checks` | Opening and closing checklist ticks per day |
| `cooling_batches` | Cooling log with the 2-hour and 6-hour readings |
| `deadlines` | Permits, certificates, services and filings with their repeat interval |
| `inspection_ticks` | Walkthrough items confirmed, per restaurant |
| `files` | Uploaded photos and PDFs (bytes stored on disk under `DATA_DIR/uploads`) |
| `employees` | Employee profiles |
| `employee_certifications` | Food handler, manager, alcohol-service and other certificates |
| `employee_records` | Write-ups, training, illness and injury reports, reviews, notes |
| `employee_onboarding` | Onboarding checklist items completed |
| `employee_documents` | Labeled document uploads |

Schema changes go in a new numbered file in `server/migrations/` (for example `002_add_something.sql`). The server applies new migrations at startup and tracks the version in SQLite's `user_version`.

## Security

- Passwords are hashed with scrypt. Sessions use an `HttpOnly`, `SameSite=Lax` cookie that lasts 30 days.
- State-changing API calls must send `X-Requested-With: fetch`, which blocks cross-site form posts.
- Log-in attempts are rate-limited per IP and email.
- Employee files and uploads are limited to owners and managers. Uploads accept photos and PDFs only, up to 20 MB, and are served with a sandboxing Content Security Policy.
- Pages are served with a strict Content Security Policy (no inline scripts or styles).

## Adding a state

1. Add `public/assets/js/states/<state>.js` with that state's rules (copy `texas.js` as a starting point).
2. Add `public/partials/reference-<id>.html` for the Quick reference panel.
3. Add the state code to the `CHECK` on `restaurants.state` in a new migration, to `v.oneOf(... ["CA", "TX"])` in `server/routes/auth.js`, and to `STATE_CONFIGS` in `public/assets/js/boot.js`.
4. Add it as a choice on `public/signup.html`.

## Not built yet

- Inviting managers and staff to an existing restaurant (the `memberships` table supports it; there's no invite screen yet).
- Password reset by email.
- Reminder emails or calendar sync for upcoming deadlines.

## Disclaimer

Counties and cities add their own rules and set their own permit terms and fees. Confirm requirements with your local health department. This tool helps you keep records; it isn't legal or tax advice.
