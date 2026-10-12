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
- **Team:** owners invite managers and staff by email; managers invite staff. Invitees create an account (or use their existing one) from the link. Owners change roles and remove people. Anyone on more than one restaurant switches between them from the header.
- **Password reset:** "Forgot your password?" emails a single-use link that expires in an hour. Resetting signs out every other session.
- **Deadline reminders:** a morning email to owners and managers listing anything due in 30 days, 7 days, tomorrow or today, and weekly while overdue, covering deadlines and employee certificates. Each person can turn it off under Settings.
- **Calendar feed:** a private `.ics` link that Google Calendar, Outlook and Apple Calendar can subscribe to, with every deadline and certificate expiry.

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
| `APP_URL` | `http://localhost:<PORT>` | Public address of the site, used in emailed links and the calendar feed URL |
| `SMTP_URL` | — | Mail server, e.g. `smtps://user:password@smtp.example.com:465`. Without it, emails are written to `DATA_DIR/outbox/` and logged instead of sent. |
| `MAIL_FROM` | `Line Check <no-reply@localhost>` | Sender address for emails |
| `REMINDER_HOUR` | `7` | Hour of the day (server's local time) after which the daily reminder emails go out |

`data/` is git-ignored. Back it up: it holds every record and upload.

## Project structure

```
server/
  index.js              Entry point: opens the database, starts the HTTP server
  app.js                Express app: security headers, sessions, API routes, static files, errors
  db.js                 Opens SQLite and applies migrations
  auth.js               Password hashing, sessions, role checks, CSRF guard, rate limits
  mailer.js             Email through SMTP_URL, or to DATA_DIR/outbox when it isn't set
  reminders.js          Daily reminder digest
  migrations/
    001_initial.sql     Database schema
    002_team_and_notifications.sql  Invitations, password resets, reminders, calendar feed
  lib/
    validate.js         Request validation helpers and HttpError
    mappers.js          Database rows → API JSON
    upcoming.js         Dated items (deadlines, certificate expiries) for reminders and the calendar
  routes/
    auth.js             Sign-up, log-in, log-out, current user, restaurant switch, password reset
    account.js          Your profile, reminder preference, password change
    team.js             Team members, invitations, accepting an invite
    calendar.js         Calendar feed URL and the .ics feed
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
  forgot.html           Ask for a password reset link
  reset.html            Choose a new password
  invite.html           Accept a team invitation
  app.html              Dashboard (requires a session)
  partials/             Per-state Quick reference panels
  assets/css/           Stylesheet (light and dark themes)
  assets/js/
    boot.js             Dashboard loader: checks the session, loads the state config and app scripts
    states/             Per-state rules: limits, checklists, starter deadlines, employee-file rules, page text
    lib/                utils.js, api.js (fetch client), store.js (state and operations)
    features/           daily-log, deadlines, inspection, employees, exports, settings
    main.js             Summary strip, tabs, account menu, action dispatch, polling
    pages/              Scripts for the public pages
test/
  helpers.js            Starts the app on a throwaway database with a capturing mailer
  api.test.js           Core API tests (node:test)
  team-and-notifications.test.js  Invites, roles, password reset, settings, calendar, reminders
```

## Database

SQLite, one file. Every business table carries a `restaurant_id`, and every query is scoped to the signed-in user's restaurant.

| Table | Holds |
| --- | --- |
| `users` | Accounts (email, scrypt password hash, name, role title, reminder preference) |
| `restaurants` | Restaurant profile, state (`CA` or `TX`) and calendar feed token |
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
| `invitations` | Team invitations (hashed link token, role, expiry, accepted date) |
| `password_resets` | Single-use reset links (hashed token, expiry, used date) |
| `reminder_runs` | One row per restaurant per day the reminder email ran, so it never sends twice |

Schema changes go in a new numbered file in `server/migrations/` (for example `002_add_something.sql`). The server applies new migrations at startup and tracks the version in SQLite's `user_version`.

## Security

- Passwords are hashed with scrypt. Sessions use an `HttpOnly`, `SameSite=Lax` cookie that lasts 30 days.
- State-changing API calls must send `X-Requested-With: fetch`, which blocks cross-site form posts.
- Log-in attempts and password reset requests are rate-limited per IP and email. The reset form gives the same answer whether or not an account exists.
- Invitation and reset links are random 256-bit tokens; only their SHA-256 hashes are stored. Invitations expire after 7 days, reset links after 1 hour, and both work once.
- The calendar feed URL is a secret link. Anyone who has it can read deadline names and dates, so Settings lets managers replace it.
- Employee files and uploads are limited to owners and managers. Uploads accept photos and PDFs only, up to 20 MB, and are served with a sandboxing Content Security Policy.
- Pages are served with a strict Content Security Policy (no inline scripts or styles).

## Adding a state

1. Add `public/assets/js/states/<state>.js` with that state's rules (copy `texas.js` as a starting point).
2. Add `public/partials/reference-<id>.html` for the Quick reference panel.
3. Add the state code to the `CHECK` on `restaurants.state` in a new migration, to `v.oneOf(... ["CA", "TX"])` in `server/routes/auth.js`, and to `STATE_CONFIGS` in `public/assets/js/boot.js`.
4. Add it as a choice on `public/signup.html`.

## Disclaimer

Counties and cities add their own rules and set their own permit terms and fees. Confirm requirements with your local health department. This tool helps you keep records; it isn't legal or tax advice.
