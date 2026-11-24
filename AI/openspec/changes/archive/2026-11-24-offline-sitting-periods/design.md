## Context

An offline sitting row already has `opens_at`, `closes_at` and `duration_s` (migration 006, offline columns in 013). Until it is started, `opens_at`/`closes_at` hold the plan; `startSitting` (`exam/tests.js`) overwrites them with `at` and `at + row.duration_s`, so the started window already follows the **sitting's** duration. What ties the duration to the test today is only the write path: `createOfflineSitting` copies `test.duration_s`, `updateOfflineSitting` keeps `row.duration_s`, and `updateOfflineTest` rewrites `duration_s`/`closes_at` of every planned sitting when the test's duration changes.

On the client, `drawOfflineForm` (`exam/client/tests.js`) has a date and a clock-time field only. The online form is built on one window state with two editors (`windowEditor`, `periodsEditor`, `clockEditor`; school-periods D7, sitting-start-window D5). `exam/client/periods.js` is DOM-free and shared with the server and the unit checks.

## Goals / Non-Goals

**Goals:**
- One plan state for the offline form, `{ opensAt, durationMinutes }`, read and written by a lessons editor and a clock editor, like the online form.
- Per-sitting duration end to end, with no schema change.

**Non-Goals:**
- No change to the online sitting form or its stored window.
- No change to how a started offline sitting runs, is extended or ended.
- No conversion of stored sittings.

## Decisions

### D1 — The plan is start plus duration, not a window of periods

The form sends `{ opensAt, durationMinutes, participants | retakes }`; the server stores `opens_at = opensAt`, `duration_s`, `closes_at = opensAt + duration` (`plannedTimes` as today, fed the sitting's duration). Lessons are only an input aid and a display match, never stored. *Alternative:* store start and end lesson. Rejected: the duration must be free to differ from the lessons (a 20-minute short test in lesson 2), and display matching from instants already works this way for both kinds.

### D2 — `periods.js` gains the offline plan in both directions

- `planFor(periods, date, from, offset, to)` → `{ opensAt, closesAt }`: `from.start + offset` to `to.end` on `date`; throws for an unknown period, `to < from` or an end past midnight.
- `matchPlan(periods, opensAt, durationMinutes)` → `{ date, from, offset, to }` or null: the start lies in `[from.start, from.end)` on its Vienna date; `to` is the period whose end equals the planned end (to the minute, `to >= from`), or `from` when the end lies within `from` (before or at its end). Anything else is null.
- `defaultPeriods` stays as is for the proposal (offline default offset 0, as today's offline proposal starts at the lesson's start).

Pure functions, unit-checked like `startWindowFor`/`matchStart`.

### D3 — Recompute on lesson or minutes, keep a typed duration

The lessons editor holds `{ date, from, offset, to, duration }`. A change of `from`, `offset` or `to` sets `duration = minutes(planFor(...))` and writes it into the duration field (with `to = max(to, from)` first). A change of the date or a typed duration leaves the other fields as they are. Opening a new form does **not** recompute: it shows the proposed duration (test's, or first sitting's for a make-up). The clock editor holds `{ date, start, end }` with duration derived; typing a duration sets `end = start + duration`. Both editors hand `{ opensAt, durationMinutes }` to the shared state; the switch carries it over through `matchPlan`, otherwise keeps date and duration and proposes the default lesson with offset 0, `to = from`.

*Alternative:* always recompute from the lessons, including on open. Rejected: a 20-minute short test would open as 50 minutes every time.

### D4 — Server: duration per sitting

`createOfflineSitting` and `updateOfflineSitting` accept `durationMinutes` (integer 1–600, refused otherwise with the existing duration refusal). Missing → the proposal: test's duration for a first sitting, first sitting's `duration_s` for a make-up (create), unchanged `row.duration_s` (update), so older clients and the HTTP checks keep working. `updateOfflineTest` stops rewriting planned sittings when the test's duration changes; the test's duration stays editable as before.

### D5 — Display of a planned sitting

`displayPlan(sitting, periods)` in `exam/client/tests.js` renders `<weekday date> · <lessons> · <planned> HH:MM–HH:MM · <n> Min` using `matchPlan` and `periodLabel` (tooltip as everywhere). It replaces `t("exam.offline.plannedFor", …)` in the test's sitting list, the course's list of tests and the attendance page before the start. Started sittings keep `displayWindow`. The make-up form lists the earlier sittings' durations above its duration field (`exam.offline.earlierDurations`). New i18n keys in `de.json`/`en.json` (BabelEdit format): planned label, end lesson, end time, duration label, earlier durations.

## Risks / Trade-offs

- [A teacher changes the minutes after typing a duration and loses it] → the recomputed value is shown in the field at once; the spec makes this the rule, and the summary line shows start and end.
- [Make-up planned before this change carries the test's duration] → unchanged by D4; the form shows it and it can be edited.
- [Test duration and sitting durations drift apart] → intended; the test page shows each sitting's duration in its line (D5), so nothing is hidden.

## Migration Plan

No migration. Deploy as usual; rollback to the previous image is safe, since the schema is unchanged and the previous code reads `sitting.duration_s` for the start already.
