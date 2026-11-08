## Context

- The cell note of the sheet (`result_note`, `016-result-notes.sql`) is shown to the student (`gradebook-sheet`, "A student's own results"). A note meant only for teachers must therefore not go into that table.
- `attempt` is unique per `(test_id, username)`, across all sittings of a test. It only exists once the student has started, and offline sittings have no attempt at all. `sitting_participant` is keyed by sitting, so a make-up sitting is a different row.
- The live view (`exam/client/live.js`) has two tables: the participant list of an online sitting, and the attendance table of an offline sitting (`this.offline`). It gets its data from snapshots (`exam/routes-live.js`) and a teacher-authenticated stream. The view for the class (`?screen=1`) is rendered by the same component.
- Every table with a path to `school_year` needs closed-year triggers (`010-year-change.sql`). The purge deletes through the `purge_in_progress` marker.
- The three red checks (see `AI/open-proposals.md` → "Drei Exam-Harness-Checks"):
  - `format.percent` formats by locale (`"81,5 %"` / `"81.5%"`). The check expects `97%` but gets `97 %`, so the live view was rendered in a different locale than the check assumes, or the tick column formats the share without the locale.
  - The sort check times out at `waitForFunction(... tbody tr:last-child ...)`.
  - The handout check waits in vain for `.sl-exam-attempt-offline[data-sitting] .sl-exam-handout-link` on `/exam/my`. Suspect: `3c26bce` (hiding the page's chrome while an attempt is written) or `757c494`.

## Goals / Non-Goals

**Goals:**
- One teacher-only note per student and test, visible and writable in every live view of that test (online and offline).
- The three checks are green, with the actual cause fixed. A check is only adjusted where the check itself is what's wrong.

**Non-Goals:**
- Showing the note in the sheet or in a separate attempt detail view. If that is wanted later, it builds on the same table.
- A history or versions of the note. Last write wins, as with the cell note.
- Notes per sitting. A make-up sitting shows the same note.

## Decisions

### D1 — Its own table `teacher_note (test_id, username)` instead of a column on `attempt` or `sitting_participant`
Keying it by test and student is what lets the note exist before the start (a student who is not yet writing), in offline sittings (no attempt) and across a make-up sitting (a new `sitting_participant`). A column on `attempt` would rule out the first two. A column on `sitting_participant` would leave the note behind when the student moves to a make-up sitting. `result_note` with a flag "teacher only" was rejected too: one wrong filter in a student route would leak the text, while a separate table never shows up in the student queries in the first place.

Schema following `016`: `id`, `test_id NOT NULL REFERENCES test`, `username NOT NULL REFERENCES student`, `text CHECK (length(text) BETWEEN 1 AND 4000)`, `created_at`, `updated_at`, `UNIQUE (test_id, username)`, an index on `username` for the purge, and three closed-year triggers through `test → course → class → school_year` (delete with the `purge_in_progress` exception). Deleting a test removes its teacher notes as well, right next to `DELETE FROM result_note WHERE test_id = ?` in `exam/tests.js`.

### D2 — Writing through its own teacher route, reading through snapshot and stream
`PUT /exam/api/tests/:testId/teacher-notes/:username` with `{ text }`. Empty or white space deletes the note, and more than 4000 characters gives 400 with the reason. It is guarded like the other teacher write routes, and a student or anonymous request gets 403. The route is placed under the test rather than the sitting, because the note belongs to the test (D1). It answers with the stored state, and after the write a `note` event goes out on the stream of every open sitting of that test, so a second teacher's view catches up (spec "A second teacher sees it"). The snapshot carries `teacherNote` per participant.

The view for the class: the snapshot for `screen=1` carries **no** notes. The server leaves them out, so it is not just the client hiding them. That way neither the projector nor its DevTools ever sees the text.

### D3 — A field in the row, saved as it changes, without moving rows
In both tables the note gets a narrow, multi-line field at the end of the row. Saving with debounce and the markings saving / saved / refused reuses the sheet's helpers, if they can be extracted without coupling. If not, it stays a small copy in `live.js`. While a note field has the focus, the rows do not move. This is the same rule as "holds still under the mouse on a button", applied to the focus. Otherwise the field would jump away during typing whenever the order changes.

### D4 — Retention: its own kind, `teacherNotes`
`exam/retention.js` gets a counter `teacherNotes: SELECT COUNT(*) FROM teacher_note WHERE username = ?` and the matching `DELETE`, within the existing transaction with `purge_in_progress`. The report shows it as a separate line next to `notes`, because the two are different kinds of data (spec `school-year-change`).

### D5 — Bisect the red checks first, then fix
For each check: run on `28e968f` (before `757c494`) and on `757c494` (before `3c26bce`) to find which commit breaks it, then fix on that side:
- **Percent**: the tick share must go through `format.percent` like every other percent value in the module (`locale-formats`). If it already does, the check is adjusted to the locale the live view runs in, in the same way the board-deck check expects `100 %`.
- **Sort timeout**: find out whether the row of the writing student fails to move down at all (a bug in `sort()` since tick-rate/full screen became part of the order), or whether it moves too slowly (more than 2 s, for example because a new figure is now polled). Bug → fix the app. Only slowness → raise the timeout to the value of the other live checks.
- **Handout link**: find out whether `/exam/my` no longer renders the offline entry, or renders it without a link. A student who is not writing must keep seeing their page and its link, so this is a fix in the app, not in the check.

### D5 — Outcome of the bisect

The suspicion did not hold for two of the three, and all three turned out to be wrong in the check, not in the app:
- **Percent**: added with `757c494` and wrong from its first run. The tick share already goes through `format.percent` (`97 %` with a no-break space, like the focus share's `100 %` in the same view); the check now expects that.
- **Sort timeout**: already red on `28e968f`. The last step waited for the writing student's row to stop being last once sorted back, but in `9xgb` that student is last by name too, so the condition could never come true. `sort()` is right. The check now sends the row to the top (not started, longest out of focus) and waits for that, whatever the names are.
- **Handout link**: already red on `28e968f`. Earlier suites leave the shared student with running online attempts, and `/exam/my` resumes a running attempt at once, as specified, in front of the list. This is not the case D5 assumed (a student who is not writing), so the app stays as it is; the offline suite submits whatever attempt the shared student still has running before it starts.

## Risks / Trade-offs

- [The note leaks to students through a shared serializer] → it lives only in its own table and is added only in the teacher snapshot. A test asserts that no student response (attempt, `/exam/api/my/tests`, results) contains a marker text.
- [Two teachers type at the same time, last write wins] → accepted, as with the cell note. The stream shows the other teacher's version as soon as it is saved. A field that has the focus is not overwritten from outside while it is being typed in; after a blur it takes the current server state.
- [The bisect shows that `757c494` breaks the order rule itself] → then the fix touches the `online-test` requirement "Teachers follow a sitting live". If it turns out that the spec is wrong rather than the code, the delta gets extended accordingly before the fix goes in.

## Migration Plan

`018-teacher-notes.sql` only adds a table, triggers and an index, and nothing gets rebuilt. Rollback means removing the table in a later migration. Older code ignores the table.
