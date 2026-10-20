Source: Gerald, 2026-10-20: "Das Datum an dem ein Test stattfindet ist NIE über Mitternacht. Also reicht ein einzelner selector für das Datum völlig."

## Why

A sitting's window never crosses midnight; a test is written within one school day. The clock-time form still asks for two full timestamps, **Opens** and **Closes**, each with its own date field, so a teacher picks the same date twice and can pick two different ones by mistake.

## What Changes

- **The clock-time form asks for one date and two times:** **Date**, **Opens** (HH:MM) and **Closes** (HH:MM). The window opens and closes on that date, Vienna time.
- **The same date field serves both editors.** Switching between lessons and exact times keeps the date, as today.
- **Rescheduling** uses the same fields, so the proposed weekday is set once.
- What the form sends, how a sitting is stored and every server rule stay as they are; the API still takes two instants.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `school-periods`: the clock-time fields become one date and two times, with and without configured periods.

## Impact

- `exam/client/tests.js`: `clockEditor` builds one `sl-date-input` without time and two time fields.
- `css/exam.css`: the time fields in the form, if needed.
- `i18n/en.json`, `i18n/de.json`: labels if new ones are needed.
- `test/exam.test.js`: the checks that read the `opensAt`/`closesAt` fields of the sitting form.
- `docs-exam-module.md`: the clock-time fields.
