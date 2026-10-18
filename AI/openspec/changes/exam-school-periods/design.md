## Context

A sitting is stored as `opens_at`/`closes_at` (ISO instants) plus `duration_s` (`exam/tests.js`, `sittingTimes`). The client schedules it with two `datetime-local` inputs in `drawSittingForm` (`exam/client/tests.js`) and shows windows through `displayWindow`. That function is used in the list of tests, the sittings of a test and the live view, and through the live view also on the class screen (`exam/client/live.js`). Formatting is hard-wired to `de-AT` with `Europe/Vienna`. The module reads its configuration from the environment at start (`EXAM_MODULE`, `EXAM_DB_PATH`), and `GET /exam/api/me` is already the client's first request. Creating a sitting whose window has already opened is allowed (it opens at once). Changing one is refused once it has opened.

## Goals / Non-Goals

**Goals:**
- One parser and one matcher for periods, shared by server and client, so both sides agree on what "lies on period boundaries" means.
- One drawing helper for a period range with its tooltip, so the hover rule holds everywhere by construction.

**Non-Goals:**
- No change to the database, the sitting API or the server's sitting checks.
- No weekday or holiday calendar. Every date offers every period.
- No periods in the gradebook, and no German translation of the label. The per-user language change will translate it.
- No change to **Minutes per attempt**. It keeps its default (15 min, or the first sitting's duration) and is not derived from the window.

## Decisions

**D1 – Variable `SCHOOL_PERIODS`, format `n=HH:MM-HH:MM,…`.** This matches the format in the backlog entry and is readable in a GitHub repository variable. JSON was the alternative, but it is awkward to quote in compose files and workflow YAML. Every period is listed with its own start and end, because the school's breaks are irregular. Whitespace around entries is ignored.

**D2 – A malformed value disables the module.** If a wrong value were silently ignored, the form would quietly fall back to clock times and the error would go unnoticed until someone schedules a test. Instead `init()` answers `{ active: false, reason }` with the parser's message, as it does for a database that cannot be opened, so the log says "Exam module: disabled - …" and the reader keeps serving (`exam-foundation`, "A module failure never stops the reader"). Stopping the whole process was considered and rejected on 2026-10-18: it would be the module's only failure that takes the reader down. The check runs only when the module is on; with `EXAM_MODULE` off the variable is not read.

**D3 – One ES module `exam/client/periods.js`, imported by the server too.** It holds `parsePeriods(text)` (throws with the offending entry), `matchWindow(periods, opensAt, closesAt)` → `{date, from, to}` or null, `windowFor(periods, date, from, to)` → `{opensAt, closesAt}`, and `defaultPeriods(periods, now)`. It is free of DOM code, so the server (`exam/index.js`, at start) and the unit tests import the same file the browser loads from `/exam/assets/`. All time arithmetic goes through `Intl.DateTimeFormat` with `timeZone: "Europe/Vienna"`. That includes converting a Vienna date and wall-clock time to an instant, which is done by computing the offset for that date, so the DST changeovers come out right. The alternative, a second copy for the server, risks the two drifting apart.

**D4 – The periods reach the client with `/exam/api/me`.** The response gains `periods: [{n, start, end}]` (empty when unconfigured). The client already waits for this request, so no second round trip is needed and no attribute has to be put on every frame. The server sends the parsed form, so the client never parses environment text.

**D5 – A window matches only exactly.** A window matches periods when `opensAt` equals some period's start and `closesAt` equals the end of the same or a later period, both on the same Vienna date, compared to the minute. Anything else (a minute off, across midnight, from > to) is shown in clock times. A tolerance would hide real differences, and the teacher has to be able to trust that "periods 3–4" really means 10:00–11:45.

**D6 – Drawing: `periodLabel(periods, from, to)` returns a `<span class="sl-exam-periods" title="10:00–11:45">`.** `displayWindow` becomes an element-returning function. Its call sites build text today with template strings (`tests.js:104`, `:236`; `live.js:171`, `:176`) and switch to `h()` children. In the live view the window line is redrawn every second, so it is built once, and only the remaining-time text beside it changes. Otherwise the tooltip would flicker under the cursor. The period choices in the form are `<option title="…">`. Chrome on desktop shows that tooltip in the open list, and because the form also shows the resulting clock times (spec) the choice never depends on hovering.

**D7 – The form keeps one window state and two editors.** The state is `{opensAt, closesAt}`. The periods editor (date input plus two `<select>`) and the clock-time editor (the existing two `datetime-local`) both read from and write to it. The switch button swaps which editor is drawn. The submit body is built from the state exactly as today. The date input stays a native `<input type="date">`, until the language change replaces it with its own picker.

**D8 – Label format `Di 20.10. · lessons 3–4`.** The date uses the existing `de-AT` short weekday and day.month, consistent with the rest of the module today. The UI calls a period "lesson"/"lessons" (Gerald, 2026-10-18: closer to the German "Einheit" than "period"), in English like the rest of the UI; configuration and code keep "period" (`SCHOOL_PERIODS`, `periods.js`). A window spread over several days is never shown as periods (D5).

## Risks / Trade-offs

- [DST night: a Vienna date where 02:00–03:00 does not exist or repeats] → periods lie between 07:05 and 22:10, never in that hour. The offset is computed per date, so the result is right on both changeover days. Unit tests cover 2026-10-25 and 2027-03-28.
- [Schedule changes and old sittings: a later change to `SCHOOL_PERIODS` makes old sittings stop matching] → they fall back to clock times. That is correct, because they were held at those times.
- [`<option title>` is not shown on touch devices] → the resulting clock times are always visible in the form (D6), so nothing depends on the tooltip.
- [Teacher schedules the running period at 10:20] → the window opens at 10:00 and is open at once, which is allowed today too. The form defaults to that on purpose, because it is the "test now" case.

## Migration Plan

1. Implement in safeLearn; with the variable unset, nothing changes, which the harness checks.
2. Add `SCHOOL_PERIODS=${SCHOOL_PERIODS}` to `deploy/docker-compose.yml`, and to `.github/workflows/docs-local.yml` the line that writes `SCHOOL_PERIODS=${{ vars.SCHOOL_PERIODS }}` into `deploy/.env` next to `EXAM_MODULE`. Document both in `docs-exam-module.md`. The workflow is upstream code and reaches secureLectures with the merge.
3. In secureLectures, create the repository variable `SCHOOL_PERIODS` with the school's list, then merge `public/master` and push (downstream: configuration only). Then check that a deploy run starts for HEAD.
4. Rollback: unset the variable and redeploy. Sittings are unaffected, because they were always stored as instants.
