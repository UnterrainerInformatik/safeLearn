Source: AI/open-proposals.md ("Mitarbeitskontrollen als Noten 1–5", "Lehrer-Session bleibt nach `vt: 0` in der Schüleransicht hängen", "Jede Präsentation passt auf den Schirm")

## Why

Three backlog items, bundled into one change at Gerald's request (2026-11-09):

1. A participation check (`plusminus`) only knows `+` and `−`, which is too coarse. A teacher wants to grade it from 1 to 5, with the same meaning as everywhere else.
2. When `test/exam.test.js` runs alone, two checks cannot switch the teacher session back out of student view (`vt: 0`). Every later check in their describe then fails with `403`, which hides whether those checks would pass.
3. On the board solution of the last CDI test, questions with images ran off the screen. A deck shown in a classroom must always fit the projector or monitor.

## What Changes

- **Participation as grades.** A participation result is a whole grade from 1 to 5. It counts like a presentation's grade, with its fraction at the middle of the grade's band on the current scale. The sheet's participation fields take a grade. As shortcuts they also take `+` (→ 1), `o` (→ 3) and `-` (→ 5), so a quick round can still be entered with three keys (Gerald, 2026-11-09). What is stored and shown is always the grade.
- **Existing marks are migrated.** Every stored participation `+` becomes grade 1, every `−` becomes grade 5 (decided with Gerald 2026-11-09). From then on they count at the band midpoint, like every other grade. Proposals that include participation therefore shift slightly: from 1.0 / 0.0 to the midpoints of 1 and 5.
- **Project marks stay as they are.** `projectmark` columns keep their `+`/`−` and count towards nothing.
- **The teacher session leaves student view reliably.** The cause of the failed reset is found and fixed: either in the application, so a written preference block is never overwritten by an older one, or in the harness. After the fix `test/exam.test.js` passes alone and inside `npm test`, and the backlog's follow-up failures (`403`) are gone.
- **Every deck fits the screen.** A slide whose content is larger than the screen is scaled down until it fits, with its proportions kept. This applies to every deck rendered through `wrapInReveal`: corpus presentations, handout solution decks and the board solution. Images scale along with the rest of the slide. Only slides that do not fit are touched. A slide that fits today looks exactly as it does today. The baseline is `md/presentations/Quarkus/JPA - Basics (1).md` in secureLectures (https://htl.dev/md/presentations/Quarkus/JPA%20-%20Basics%20(1).md), which is already optimized for the board and must stay unchanged (Gerald, 2026-11-09). The app never splits a slide. If a slide gets too small to read, the teacher reformats it.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `gradebook`: "Teachers enter manual results per student" — a `plusminus` result is a grade from 1 to 5. "Results are stored as fractions between 0 and 1" — participation joins the results entered as a grade.
- `gradebook-sheet`: "Columns of a course's manual results" and the arrow-key requirement — a participation field takes a grade, and existing marks are migrated.
- `presentation-view`: new requirements "Every slide fits the screen" and "A slide that fits today looks as it does today".
- `browser-verification`: new requirement that a preference reset in a check is proven, independent of which test files ran before.

## Impact

- `exam/gradebook.js` (`gradeKinds`, `normalizeResult`, `columnMax`, `entryFromRow`), `exam/grading.js` (comments), `exam/client/gradebook.js` (`isMark`, `isGraded`, field rendering and input), i18n keys of the participation field and error.
- New migration `exam/migrations/019-participation-grades.sql`: sets `grade` on existing `plusminus` entries. It must get past the closed-year triggers of `manual_entry`.
- `obsidian.js` (a small fit script in the deck of `wrapInReveal`; `Reveal.initialize` stays as it is), `css/reveal.css`.
- `middlewares/keycloak-middleware.js` (`setUserAttribute`, `getUserAttributes`) or `test/harness.js` (`setPreferences`), depending on what the investigation shows.
- Tests: `test/exam-gradebook.test.js`, `test/exam.test.js` (participation in the sheet), a deck-fit check in the content or browser suite, `test/coverage-map.json`.
- Docs: `docs-exam-module.md` (participation), the presentation docs (fit rule).
