## 1. Periods core

- [x] 1.1 `exam/client/periods.js` without DOM code: `parsePeriods` (format, unique numbers, start < end, no overlap in ascending order, adjacent allowed; error names the entry), `windowFor`, `matchWindow`, `defaultPeriods`, all Vienna time via `Intl` (D3, D5)
- [x] 1.2 Unit tests `test/exam-periods.test.js`: the school's full list incl. 11/12 back to back; overlap, malformed entry, duplicate number; window ↔ periods round trip; one minute off and across midnight do not match; defaults at 10:20, in a break, at 22:30; DST days 2026-10-25 and 2027-03-28
- [x] 1.3 Module start reads `SCHOOL_PERIODS` only with `EXAM_MODULE=on`; malformed value disables the module (`init()` → `{active:false, reason}`) with the parser's message; the parsed periods go into `GET /exam/api/me` as `periods` (empty when unset) (D2, D4)

## 2. Displays

- [x] 2.1 `periodLabel` in `periods.js` (or a DOM companion module) drawing `<span class="sl-exam-periods" title="HH:MM–HH:MM">`; `displayWindow` returns an element: periods label with date when the window matches, clock times otherwise (D6, D8)
- [x] 2.2 Switch the call sites in `exam/client/tests.js` (list of tests, sittings of a test) to the element form
- [x] 2.3 Live view and class screen in `exam/client/live.js`: window drawn once, only the remaining-time text updated each second, so the tooltip stays put

## 3. Sitting form

- [x] 3.1 Window state plus two editors in `drawSittingForm`: date + from/to `<select>` with `title` per option and the resulting clock times shown live; to period never before from; clock-time editor as today (D7)
- [x] 3.2 Switch button between periods and exact times (a button, not a link); a sitting off the period boundaries opens in exact times; switching carries a matching window over, otherwise keeps the date and proposes the defaults
- [x] 3.3 Without periods configured the form is exactly today's form (no switch, no selects)

## 4. Harness and deployment

- [x] 4.1 Harness checks in `test/exam.test.js` with `SCHOOL_PERIODS` set: scheduling periods 3–4 stores 10:00/11:45 Vienna; list and live view show `periods 3–4` with tooltip `10:00–11:45`; an off-grid sitting shows clock times and opens the form in exact times; one check without the variable proving today's form and displays
- [x] 4.2 Register the new test file and `exam/client/periods.js` in `test/coverage-map.json`
- [x] 4.3 `deploy/docker-compose.yml` and `.github/workflows/docs-local.yml` pass `SCHOOL_PERIODS`; `test/deployment-config.test.js` checks the compose line; the WYSIWYG templates still set nothing
- [x] 4.4 `docs-exam-module.md` (variable, format, the school's list as example, behavior without it) and `AI/architecture.md` (config, `/api/me`, shared module)
- [x] 4.5 `npm test` in both module configurations; record the result
  - Result 2026-10-18: `test/exam-periods.test.js` 22/22, `test/exam-foundation.test.js` 25/25, `test/deployment-config.test.js` 9/9, `test/coverage.test.js` 4/4. Full `npm test`: 614/624; the misses were a `/me` expectation in `exam-foundation.test.js` (fixed, `periods: []`), a refused preference write by the identity provider that cascaded through the gradebook sheet checks (gone on the re-run), and the known flaky reload backoff in `deployment-surface` (gaps 192/82/2006/4003 ms, see `flaky-content-checks`). Re-run of `exam.test.js` + `content.test.js` (module on with and without `SCHOOL_PERIODS`, module off): 250/251, only the reload backoff.
- [ ] 4.6 secureLectures: create repository variable `SCHOOL_PERIODS` with the school's list (Gerald or via `gh variable set`), merge `public/master`, push, confirm a deploy run for HEAD; smoke-check one sitting scheduled by periods with Gerald's teacher account
