# Line Check

A compliance helper for small restaurants: a daily food safety log, a permit and renewal tracker, and a self-inspection walkthrough, each tuned to one state's food code.

| Page | Rules it follows |
| --- | --- |
| [`california.html`](california.html) | California Retail Food Code (CalCode) |
| [`texas.html`](texas.html) | Texas Food Establishment Rules (25 TAC Chapter 228) |

## What it does

- **Today's log:** temperature, cooking, sanitizer and handwash-water readings, checked against the state limit as you type. An out-of-range reading needs a corrective action before it can be saved. Includes a cooling log (135°F → 70°F in 2 hours, → 41°F in 6 hours) and opening/closing checklists.
- **Permits & renewals:** health permit, manager and food handler certificates, hood cleaning, fire suppression, backflow, grease, pest control, and state tax and alcohol filings. "Mark renewed" rolls each item to its next due date. Exports to a CSV that Google Calendar can import.
- **Inspection prep:** a walkthrough modeled on how county and city inspectors score, with the highest-risk items flagged.
- **Employees** (Texas page): one file per employee with certifications, onboarding paperwork, write-ups, training and illness records, and attached scans. Expiring cards feed the renewals tracker. Files are visible only to managers.
- **Quick reference:** temperatures, sanitizer strengths, illness exclusions, closure triggers and agency links.

## Running it

Each page is a single self-contained HTML file built to run as a [claude.ai](https://claude.ai) artifact. Inside an artifact, records are kept in a shared database so the whole team sees the same logs, and file uploads and CSV exports are available.

Opened directly in a browser, the pages still work, but they save to that browser's local storage only, and uploads and exports are hidden.

## Disclaimer

Counties and cities add their own rules and set their own permit terms and fees. Confirm requirements with your local health department. This tool helps you keep records; it isn't legal or tax advice.
