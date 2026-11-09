## 1. Participation as grades 1–5

- [x] 1.1 `exam/gradebook.js`: add `plusminus` to `gradeKinds`. Turn the shortcuts `+`/`o`/`-` (also `−`, `O`) into the grades 1/3/5 for `plusminus`. Restrict the mark branch of `normalizeResult` and the `mark` flag in `entryFromRow` to `projectmark`. Adjust the doc comments in `exam/gradebook.js` and `exam/grading.js` (D1)
- [x] 1.2 `exam/migrations/019-participation-grades.sql`: drop `manual_entry_closed_year_update`, set `grade` 1/5 and `value` to the current scale's band midpoint for every `plusminus` entry with `grade IS NULL`, recreate the trigger unchanged (D2)
- [x] 1.3 `exam/client/gradebook.js`: `isMark` only for `projectmark`, `isGraded` additionally for `plusminus`. The participation field also takes `+`/`o`/`-` and shows the saved grade. Check that field, placeholder, arrow keys, Enter, row colour and the student's own results view show a grade
- [x] 1.4 i18n: update the participation field's and error's texts (`participationMark` is now only for project marks, or rename it to `projectMark`). Keep the language files in sync (BabelEdit format)
- [x] 1.5 `test/exam-gradebook.test.js`: participation takes `{ grade }` and the shortcuts `+`/`o`/`-` → 1/3/5, refuses `++`, `x`, 0, counts at the band midpoint. Migration test: `+`→1/0.94, `−`→5/0.25 on scale 88/75/63/50, also in a closed year, `projectmark` untouched, note and date kept. Adapt the existing `plusminus` fixtures
- [x] 1.6 `test/exam.test.js`: the sheet checks with participation (`addColumn({ kind: "plusminus" })`, around lines 612, 980, 1183) type grades and the shortcuts (`+`, `o`, `-` → 1, 3, 5). Update the coverage map texts
- [x] 1.7 `docs-exam-module.md`: participation is graded 1–5, and old marks were migrated

## 2. Teacher session leaves student view reliably

- [x] 2.1 Reproduce: run `node --test test/exam.test.js` alone (with the usual env). Log the order of the `config` and `lastVisitedUrl` writes in `setUserAttribute` (timestamps, the `config` value they carry). Confirm or refute the lost update from design.md (an old `config` written back by a page's `lastVisitedUrl` write). Record the result in design.md under "Open Questions"
- [x] 2.2 If confirmed: serialize `setUserAttribute` per account and merge against a freshly read account instead of the permission-context copy (D3). Keep `applyWrittenAttribute` as it is. If refuted: fix the cause found in `setPreferences` (`test/harness.js`) instead, and mark D3 as dropped in design.md
- [x] 2.3 Unit check for 2.2 in `test/permission-context.test.js` or a new small test: two overlapping writes (`lastVisitedUrl` with an old account, then `config`) end with the new `config`
- [x] 2.4 Verify: `test/exam.test.js` alone three times green at the two checks named in the backlog and at their follow-up checks ("the heartbeat is guarded …", "a start without full screen …", "below the fifth year nobody is a candidate …"), then the full `npm test` (see the memory note on flaky checks)

## 3. Every deck fits the screen

- [x] 3.1 Baseline before the change: screenshots of every slide (with all fragments shown) of `JPA - Basics (1).md`. Gerald's working copy is at `/mnt/data/nextcloud/secureLectures/presentations/Quarkus/JPA - Basics (1).md`, with its images next to it in the vault. Render it against the local instance at HEAD, with the file and images copied only temporarily into a scratchpad corpus, not checked into safeLearn. The board's resolution is unknown, so compare at three typical sizes: 1920×1080, 1280×800 (WXGA projector) and 1024×768. Keep the comparison script in the scratchpad
- [x] 3.2 Fit script in the deck of `wrapInReveal` (`obsidian.js`): measure the current slide with all fragments counted, and shrink only if it is larger than the slide (tolerance ~2 px), via `zoom`/`transform`. If it fits, set nothing. Rerun on `ready`, `slidechanged`, `resize` and image `load`. `Reveal.initialize` stays unchanged (D4.1)
- [x] 3.3 `css/reveal.css`: relax the image limits only as far as the baseline allows (D4.2). The code and PDF iframe limits (`60vh`/`65vh`) stay
- [x] 3.4 Comparison: the baseline deck after the change gives the same screenshots per slide at all three sizes from 3.1, wherever the slide fits there today (pixel diff 0, or explain the deviation). A slide that does not fit there today may shrink, and that is reported separately. The board solution of a test with a large image fits wholly. A handout solution deck and a corpus deck with long code shrink only their too-large slides. A window resize keeps the fit
- [x] 3.5 Automated check (browser suite): on a board solution with an image taller than the screen, every element of the current slide lies inside the viewport. A short slide carries no fit style. Resizing keeps the fit. Add it to the coverage map
- [x] 3.6 PDF export (`?print-pdf`): a shrunk slide fits on its page, and a fitting one is unchanged. If `zoom` is lost, switch to `transform`
- [x] 3.7 Docs: the fit rule in the presentation section (`docs-obsidian.md` or `docs-render-pipeline.md`, wherever decks are described)

## 4. Wrap-up

- [x] 4.1 Remove the three entries from `AI/open-proposals.md` when archiving (Source line in proposal.md)
- [x] 4.2 `npm test` green on the whole (flaky checks rerun once). `openspec validate participation-grades-and-fitting-decks --strict`
