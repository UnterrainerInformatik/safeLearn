Replaces tasks 8.1–8.4 of `exam-module`. Each section ends deployable to secureLectures with `EXAM_MODULE=on`, and no existing year is closed by deploying it.

## 1. Closing a year

- [ ] 1.1 Migration `010-year-change.sql`: `school_year.closed_at`, the `purge_in_progress` marker table, and the insert/update/delete triggers of D2 on every table with a path to `school_year`; unit test that schema 9 with a filled gradebook, pool and tests migrates with every proposal unchanged
- [ ] 1.2 Unit test that enumerates every table with a path to `school_year` from the schema and asserts its three triggers (D2, Risks)
- [ ] 1.3 `closeYear` in `exam/classes.js` per D1; `yearFromRow` reports `closed`/`closedAt`; the abort message maps to `ConflictError("exam.errors.years.closed")` in the shared error path; the attempt sweep logs and skips a refused attempt
- [ ] 1.4 `POST /exam/api/years/:id/close` behind `requireTeacher`; the year's overview shows **Close school year** after the end date with an in-page confirmation; every write control on a closed year's pages is disabled, with a note that the year is closed
- [ ] 1.5 Catalog keys in `i18n/en.json` and `i18n/de.json`; `test/i18n-catalog.test.js` stays green

## 2. The next year

- [ ] 2.1 `nextYearProposal` and `copyCourse` per D6; unit tests for the successor names (`3ahif` → `4ahif`, `5ahif` none, existing successor marked), roster pre-ticks, teachers never offered, a course copied without columns and tests
- [ ] 2.2 `GET /exam/api/years/:id/next-classes` and `POST` to create one class with its roster and copied courses in one transaction
- [ ] 2.3 Client: on a new year's overview, the proposal per class with last year's roster ticked beside the directory's other members, the courses to copy, and **Create**; the directory-unavailable state as in the roster editor

## 3. Retention

- [ ] 3.1 `EXAM_RETENTION_YEARS` parsed at module start per D5; `deploy/docker-compose.yml` passes it through; `test/deployment-config.test.js` knows it; `docs-exam-module.md` documents it
- [ ] 3.2 `exam/retention.js`: `retentionReport(db, today)` and `purgeLeavers(db, today, expected)` per D3/D4; unit tests: due vs. not yet due vs. still on a roster, never on any roster, counts per kind, refused on changed counts, closed-year rows deleted through the marker, nothing but the leaver's rows removed
- [ ] 3.3 `GET /exam/api/retention` and `POST /exam/api/retention/purge`; on the current year's overview a **Remove leavers' records** section with the report (counts only) and a confirmation; the log records counts only ([[pii-handling-real-data]])

## 4. Checks and docs

- [ ] 4.1 Harness checks: a closed year refuses an entry, a column, a course and a roster change with 409 and shows its sheet read-only; closing before the end date refused; next-year proposal with last year's roster ticked; retention deletes only after confirmation and only the reported counts
- [ ] 4.2 Update `AI/architecture.md` and `docs-exam-module.md` (closing, next year, retention, `EXAM_RETENTION_YEARS`)
- [ ] 4.3 Run `npm test` in both module configurations and record the result
