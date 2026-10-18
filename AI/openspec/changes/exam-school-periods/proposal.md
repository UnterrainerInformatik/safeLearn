Source: AI/open-proposals.md, entry **Sittings nach Unterrichtseinheit statt nach Uhrzeit planen**. Gerald's addition on 2026-10-18: wherever the UI shows a period, hovering it shows its clock times. The variable's name was left to this change.

## Why

A teacher thinks of a test as "Monday, periods 3 and 4", not "20.10. 10:00 to 11:45". Today a sitting is scheduled with two `datetime-local` fields (**Opens**, **Closes**), so the teacher has to look up the school's period times, type them, and get both dates right. The breaks are irregular (some periods follow each other without a break, there are 10 min before period 13 and before 15), which makes typos likely. Lists and the live view show clock times as well, which hides at a glance which lessons a sitting covers. The first pilot sitting with a class is on 2026-10-19, so tests are about to become routine.

## What Changes

- **The school's periods come from the deployment.** A new environment variable `SCHOOL_PERIODS` lists every period with its own start and end in Vienna time, e.g. `0=07:05-07:55,1=08:00-08:50,…`. No cadence is derived. A malformed value switches the module off for that run, with a message in the log that names the problem; the reader keeps serving. Without the variable, everything behaves as it does today.
- **Scheduling by periods.** With the variable set, the sitting form asks for a **date** (default: today) and a **from period** and **to period** (default: the running period, or the next one; from = to). The window opens at the start of the from period and closes at the end of the to period. The data model, the API and the server's checks do not change: a sitting is still stored as two instants.
- **Exact times stay possible.** A button in the form switches to the clock-time fields and back. A sitting whose window does not lie on period boundaries (older ones, ones created through the API) opens the form in clock-time mode.
- **Periods in every display.** The test list, the sittings of a test, the live view and the class screen show a window that lies on period boundaries as date plus periods, e.g. `Di 20.10. · lessons 3–4`. Other windows keep their clock times.
- **Hovering a period shows its times.** Every place in the UI that shows a period, including the period choice in the form, carries the clock times as a tooltip (`10:00–11:45`). One shared element draws periods, so every later display gets the tooltip without extra work.
- **Deployment.** `deploy/docker-compose.yml` passes the variable through, and secureLectures sets it from a repository variable with the school's list.

## Capabilities

### New Capabilities

- `school-periods`: the school's periods as deployment configuration, their parsing and checks at start, scheduling a sitting by date and periods with the clock-time fallback, and showing windows as periods with their times on hover.

### Modified Capabilities

None. The sittings' stored form, their API and their rules (`online-test`, still in the unarchived change `exam-online-tests`) stay as they are. This change only adds a way to fill in and read the same two instants.

## Impact

- **Server:** `exam/` gets a parser for `SCHOOL_PERIODS`, run when the module starts. `GET /exam/api/me` also returns the periods, so the client needs no second request.
- **Client:** `exam/client/tests.js` (sitting form, `displayWindow`), `exam/client/live.js` (window line in the live view and on the class screen), and a new shared module for periods (matching a window, drawing a period with its tooltip).
- **Deployment:** `deploy/docker-compose.yml`, the deployment docs in `docs-exam-module.md`, and in secureLectures the repository variable plus the workflow line that passes it (downstream: configuration only).
- **Tests:** unit checks for parsing and matching, harness checks for the form and the displays, with and without the variable.
- **Not affected:** the gradebook. Its columns keep a plain date. The student's writing view shows a countdown, not a window.
- **Order:** the per-user UI language change will rebuild the date input. This change keeps the current de-AT date format and English labels, so that change only has to translate "lesson".
