## Why

Long tests (programming tasks handed in through classroom50) and short tests on paper are written in the classroom without the exam module: the teacher puts a clock on the board by hand, hands out a printed sheet or opens a restricted file at the right moment, and keeps the attendance on paper. The module already has everything around such a test except the test itself: the projector screen with clock and time left, extending and ending a window for everyone, make-up sittings, the violet Exams button, and the gradebook. An online test cannot be used, because a test without questions can be neither scheduled nor written. And a student cannot be shown a restricted file for the duration of a test without editing its directive in the corpus.

## What Changes

- A course gets a second kind of test: an **offline test**, without questions, booked as a test or a short test in the gradebook. Nothing is written or submitted through the module. The submission happens elsewhere (classroom50, paper).
- An offline test optionally names **one or two handouts**: Markdown files of the corpus, chosen in a dialog that shows the whole `md/` tree with a search field on file names. The test stores each handout's corpus path. A path that no longer resolves is shown in red, and the sitting cannot be started until a valid file or no file is chosen. A file that students of the class can already read is flagged with a warning.
- A sitting of an offline test is **started by a button**. Its window runs from the press for the test's duration. Extending and ending apply to everyone, as they do for online tests. A sitting that is not started does not open, whatever its planned time.
- The sitting has an **attendance table**: every participant is marked present or absent, and with two handouts is assigned to group A or B (everyone starts in A). Both can be changed before and during the window, and each change takes effect at once.
- While the window is open, a **present** participant sees the sitting on their Exams page (violet button) with its time left, and, if a handout is set, a link to the handout of their group. The handout is rendered for that student, as a student, with the file's own whole-file directive set aside, the exam variant shown, and practice and answer variants hidden. Inline blocks for other roles (`@@@ teacher`, …) stay hidden. The file stays hidden in the navigation tree and in search. When the window closes, the handout and its attachments are no longer served.
- The **view for the class** (projector) works for offline sittings: title, clock, window and time left. It shows no counts and nothing that depends on a group.
- A teacher can open each handout as a **solution deck**: the same rendering with the answer variant shown, as a presentation, without results. It is offered for a handout that contains `#answer` blocks, and is refused to every session that does not act as a teacher.
- A **make-up** sitting can be created for selected absent participants. It uses the same handouts and is started by its own button. Absence does not require a make-up.
- Out of scope: any link to classroom50, results entered by the module, per-student extra time, and the hot-reload channel naming modified restricted files (recorded in `AI/open-proposals.md`).

## Capabilities

### New Capabilities
- `offline-test`: offline tests of a course, their gradebook column, sittings started by a button, the attendance table with groups, the student's Exams page entry, the view for the class, and make-ups.
- `exam-handout`: choosing a corpus file as a handout, keeping its path valid until the start, rendering it per student during the window under fixed views, its attachments, and the teacher's solution deck.

### Modified Capabilities
- `role-resolution`: the exam variant is granted, and the practice and answer variants are fixed, by the module's handout rendering for a participant whose window is open. That is the one place a student is shown `#exam` content. It is decided by the route, never by anything the request carries.
- `attachment-access`: a handout open to a session counts as a visible place for the attachments it references, until the window closes.

The gradebook column of an offline test is an ordinary manual column of the test or short-test category. `offline-test` specifies how it is created and linked, and `gradebook-sheet` does not change.

## Impact

- `exam/migrations/013-offline-tests.sql`: `test.kind`, `test.gradebook_kind`, handout paths; `sitting.started_at`; `sitting_participant.present`, `.handout_group`; the link from an offline test to its gradebook column.
- `exam/tests.js`, `exam/routes-tests.js`: creating offline tests, starting, attendance and groups, make-ups; `exam/attempts.js` `openTestsOf`/`nextOpenTestsChange` include open offline sittings.
- New `exam/handout.js` (+ routes): path resolution, the handout and solution renders, the corpus tree for the picker.
- `obsidian.js`/`utils.js`/`permission-context.js`: a request-scoped, server-set view override that `hasRoles` honours for `#exam`/`#practice`/`#answer` and the student-view downgrade; a way to render one corpus file without its whole-file gate; recording attachment grants that expire with the window.
- `exam/routes-live.js`, `exam/client/live.js`: the class screen for offline sittings. `exam/client/tests.js`, `exam/client/attempt.js` (Exams page), new picker client, `css/exam.css`, `i18n/de.json`, `i18n/en.json`.
- `docs-exam-module.md`, `docs-permissions.md` (the handout as the one exception to file-level gating), `AI/architecture.md`.
- Tests: `test/exam.test.js` and the browser harness. A handout fixture lives in `md/` under `@@@ teacher`.
