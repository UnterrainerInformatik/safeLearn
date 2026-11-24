Source: Gerald, 2026-11-24 ("wenn ich einen Test starte, sind jetzt die Schulstunden weg … Kurz: Datum, Startstunde, Start-Offset, alternativ Startzeit. Langtest (2-3h): Datum, Schulstunde Start, Schulstunde Ende, Start-Offset (verlängert Ende NICHT), alternativ Start und Endzeitpunkt separat per Zeit … Dauer stellt sich mit um"). Decided in the same conversation: one form for every offline test with a start and an end lesson; changing a lesson recomputes the duration and fills it in; each sitting carries its own duration; the page where a make-up is planned shows the durations clearly.

## Why

Planning a sitting of an offline test - a short test on paper or a long test of two to three hours - asks only for a date and a clock time, and its length is always the test's duration. The school's periods, which the online sitting form offers since `school-periods`, are missing there, so a teacher has to look up when lesson 3 starts and work out by hand how many minutes lessons 3 to 5 give, minus the minutes the start is late.

## What Changes

- With periods configured, the form that plans or changes an offline sitting asks for a **date, a start lesson, the minutes after its start, and an end lesson**, plus the **duration** in minutes. The planned start is the start lesson's start plus the minutes. The minutes do **not** move the end: changing the start lesson, the minutes or the end lesson recomputes the duration as the end lesson's end minus the planned start and fills it into the duration field. A teacher may still type another duration (a 20-minute short test in lesson 2: start lesson 2, end lesson 2, duration 20).
- The **clock-time alternative** asks for the date, the start time and the end time separately; the duration follows them, and typing a duration moves the end time. A button switches between lessons and clock times, as on the online form.
- **Each offline sitting has its own duration** (stored already as `sitting.duration_s`). A new first sitting proposes the test's duration; a make-up proposes the first sitting's. Starting a sitting runs its window for **its** duration, as today.
- The test's own duration becomes the proposal for its first sitting. Changing it no longer rewrites the duration of sittings already planned.
- A planned offline sitting is listed with its date, its lessons when its plan lies on them, its planned clock times and its duration, for example `Mo. 30.11. · 4.–6. EH · geplant 10:55–13:35 · 160 Min`. The form for a make-up shows the duration of the earlier sittings, so the teacher can keep to it.
- **Online sittings: no change.** Their form already offers date, one lesson, the minutes after its start and the clock-time alternative (`school-periods`).
- Existing planned sittings are not converted; their stored plan is read as start and duration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `school-periods`: an offline sitting is planned by date, start lesson, minutes after its start and end lesson, with its duration computed from them, and the clock-time alternative with start and end; a planned offline sitting is shown with its lessons.
- `offline-test`: a sitting carries its own duration, which its window runs for when started; the test's duration is only the proposal for a first sitting, a make-up proposes the first sitting's and its form shows it.

## Impact

- Client: `exam/client/tests.js` (`drawOfflineForm`, `offlineSittingsSection`, the test page's duration line), `exam/client/periods.js` (a planned window from start lesson, minutes and end lesson, and its match back), i18n keys in `de.json`/`en.json`.
- Server: `exam/tests.js` (`createOfflineSitting`, `updateOfflineSitting` take `durationMinutes`, 1 to 600; `updateOfflineTest` no longer pushes the test's duration onto planned sittings).
- No migration: `sitting.duration_s` exists for offline sittings already.
- Checks: unit checks for the new period functions, browser checks for the offline form (both modes, recomputed duration, make-up proposal), server checks for per-sitting durations.
- Docs: `docs-exam-module.md` (offline tests, the school's periods).
