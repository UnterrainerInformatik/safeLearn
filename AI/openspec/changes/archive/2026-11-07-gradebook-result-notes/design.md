## Context

See proposal.md for the motivation. State found on 2026-11-07 (`6d5e82b`):

- **A cell** of the sheet is a manual column's `manual_entry` row (`UNIQUE (assessment_id, username)`), or a submitted `attempt` of an online test (`UNIQUE (test_id, username)`). An online-test column is not an `assessment` row: `onlineColumns` (`exam/gradebook.js:457`) makes it from `test`, with the id `test-<id>`. An offline test has an `assessment` of its own (`test.assessment_id`), so it is a manual column.
- **Results** are written one cell per request (`PUT`/`DELETE /assessments/:id/results/:username`, `exam/routes-gradebook.js`). Each request answers the student's recomputed row (`sheetRow`). A result row exists only with a value: `manual_entry.value` is NOT NULL, and `deleteResult` removes the row.
- **Entries** come from `courseEntries`, which every view and every proposal uses. `kindInUse` there hides a category weighted 0 %. `resultsOf` (student) and `studentRecord` (teacher) list entries. `overviewRow` gives the sheet `results` by column id.
- **Deleting**: `deleteColumn` removes a column's results, and a project's mark columns with theirs. `deleteTest` removes an offline test's column only while it has no result, and an online test's attempts only for an admin. `deleteCourse` refuses while any column or test exists. Retention (`exam/retention.js`) counts and deletes per username from a fixed list, `recordKinds`. Backups copy the whole database (`VACUUM INTO`), so they need nothing.
- **Closed years**: every record table carries `*_closed_year_*` triggers (`010-year-change.sql`). Deletes pass them only during a purge (`purge_in_progress`).
- **Client**: `resultCell` (`exam/client/gradebook.js:546`) builds one `<input class="sl-exam-cell">` per cell, with `data-row`/`data-col`. `saveOnChange` (`exam/client/frame.js:382`) does the saving, saved and refused marking. `arrowKey` (`:606`) moves between `input.sl-exam-cell` by `data-row`/`data-col`, and skips columns without fields (online tests). An online-test cell is a `<td>` with text only.

## Goals / Non-Goals

**Goals:**
- A note per cell, independent of the result, for every column kind, without touching a single proposal.
- An active column that opens its notes without a re-render, so the focus and unsaved fields stay as they are.

**Non-Goals:**
- Formatting in notes (Markdown, links). A note is plain text and is shown with its line breaks.
- Setting notes outside the sheet: the teacher's student page shows them read-only.
- A history of a note's changes.
- Notes in the presentation view or in exports. Neither shows results per cell today.

## Decisions

### D1: A table of its own, `result_note`, keyed by column or test

```sql
CREATE TABLE result_note (
  id INTEGER PRIMARY KEY,
  assessment_id INTEGER REFERENCES assessment (id),
  test_id INTEGER REFERENCES test (id),
  username TEXT NOT NULL REFERENCES student (username),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((assessment_id IS NULL) <> (test_id IS NULL))
);
CREATE UNIQUE INDEX result_note_assessment ON result_note (assessment_id, username) WHERE assessment_id IS NOT NULL;
CREATE UNIQUE INDEX result_note_test ON result_note (test_id, username) WHERE test_id IS NOT NULL;
CREATE INDEX result_note_username ON result_note (username);
```

A note lives beside the result, not inside it. That is what makes "a note without a value" and "emptying the value keeps the note" come out naturally: `manual_entry` keeps its NOT NULL value and its rule that a row is a result, and every proposal and count stays exactly as it is.

*Alternative:* a nullable `note` column on `manual_entry`. This needs `value` to become nullable, so that a row can hold only a note. Then every query that reads `manual_entry` as "a result" (proposals, `resultCount`, `deleteCourse`, retention, the offline-test delete guard) must learn to skip note-only rows. And online tests would still need a place of their own. *Alternative:* a column on `attempt`. There is no attempt for a student who missed the test, and that is the case a note is most wanted for.

`length()` counts characters, not bytes, so the limit matches the spec's 4000 characters. The text is stored as typed. Only an empty or white-space-only text removes the note (spec), and line endings are normalized to `\n`.

The migration `016-result-notes.sql` only adds the table, its indexes and its closed-year triggers. The triggers reach the year through `assessment → course` or `test → course`, as the triggers of `manual_entry` and `test` do. It needs no `-- foreign_keys: off`, because nothing is rebuilt.

### D2: One cell, one route, for both kinds of column

```
PUT    /exam/api/courses/:id/notes/:column/:username   { text }
DELETE /exam/api/courses/:id/notes/:column/:username
```

`:column` is the column id as the sheet already uses it: a number for an `assessment`, `test-<id>` for an online test. `setNote(db, courseId, columnKey, username, text)` resolves the key and checks that the column or the test belongs to the course. It checks that the student is on the course's roster (`requireRosterEntry`) and that the text is at most 4000 characters (`exam.errors.gradebook.noteTooLong`). Then it upserts. An empty text after `trim()` deletes the note instead, so the client can always PUT what the field holds. The route answers `{ note }` (null once removed), not the recomputed row: a note changes no proposal, so there is nothing else to update.

*Alternative:* a `note` field in the existing result PUT. Then the value field and the note field would share one request, so a note write could re-send a stale value, which is exactly what the one-field-per-request rule (gradebook design D3) avoids. And online tests have no result route.

### D3: Notes travel with the entries they explain

`courseNotes(db, course, username = null)` reads every note of a course (manual columns through `assessment.course_id`, online tests through `test.course_id`) into a map `columnKey/username → text`, where `columnKey` is the sheet's column id. It is applied where entries are turned into views:

- `overviewRow` adds `notes: { [columnId]: text }` for the semester's columns. The columns' semester decides, as for `results`, and a project's mark columns follow the project's date. The client gets the marks from this.
- `studentRecord` and `resultsOf` add `note` to each entry. A cell with a note and no entry becomes an extra item with `value`, `points` and `grade` all null, and with its column's kind, category, name, date and semester. These items are appended **after** the proposals are computed and never enter `semesterProposal`, so a note cannot move a grade.
- The hiding rule stays where it is: note-only items are built from `courseColumns` (which already leaves out categories not in use) and `onlineColumns`, filtered by `kindInUse`.

`resultsOf` reads only `username = ?` notes, so a student's answer can contain no other student's note, by construction.

### D4: Deleting notes with what they belong to

- `deleteColumn`: deletes the column's notes, and for a project also those of its mark columns, in the same transaction as the results. The confirmation counts results and notes (`columnFromRow` gains `notes`, beside `results`). `resultCount` stays a result count.
- `deleteTest`: deletes the test's notes (`test_id`) together with its attempts. For an offline test, the column's notes do *not* block the deletion: the guard stays "no result", and its notes go with the column. A note alone is not worth keeping a test alive for.
- `deleteCourse`: unchanged. A note needs a column or a test, and either already blocks.
- Retention: `recordKinds` gains `notes: "SELECT COUNT(*) AS n FROM result_note WHERE username = ?"`, and the purge deletes them before `manual_entry`. The confirmed report's `sameCounts` therefore compares notes as well. The year-change page's report lists the new kind (i18n `exam.retention.kinds.notes`).

### D5: The active column, by a class toggle and not by a re-render

Every editable cell is built with its note field already in it: a `<textarea class="sl-exam-note" rows="1">` beside the result input, hidden by CSS. This includes the online-test cells, whose text gets a field beside it, and the rows of students who left get none. Each `<td>` carries `data-col`. A `focusin` listener on the table finds the focused cell's `data-col`. When it differs from the active one, it removes `is-note-open` from the old column's cells and header and adds it to the new one's (`querySelectorAll('[data-col="n"]')`). `focusout` to outside the table closes it. CSS shows `.is-note-open .sl-exam-note` at `width: 20ch`. The table's columns follow on their own, and the header cell widens with them.

Nothing is rebuilt, so a field being saved, a refused field's marking, and the scroll position all survive the switch. A note mark (`<button class="sl-exam-note-mark" tabindex="-1" title="…">`) stands beside the value whenever the cell holds a note. Clicking it focuses the cell's note field, which also opens the column. The mark is kept up to date from the note field's `onSaved`. `tabindex="-1"` keeps it out of Tab order: Tab already reaches the note field in an open column, and in a closed one the field is hidden.

An online-test cell gets a click handler on the whole `<td>` that focuses its note field.

*Alternative:* re-rendering the sheet with an `activeColumn` state. That loses the focus and any field in flight, which is the very thing the sheet avoids everywhere else.

*Alternative:* the popup Gerald first agreed to. He replaced it on 2026-11-07 with the active column, so a class can be annotated by arrow keys without opening and closing a dialog per student.

### D6: Arrow keys and Enter

`arrowKey` learns a second kind of field. Each cell gets two horizontal positions, `data-col` for the result and the same `data-col` with `data-part="note"` for the note. Moving right from a result field (at the end) goes to the same cell's note field while the column is open. From a note field it goes to the next column's result field. Left goes back the same way. Up and down from a note field go to the same column's note field of the neighbouring row. The edge test checks for the first or last line: no `\n` before the cursor for up, and no `\n` after it for down. A whole-text selection counts as both edges, as for the result fields. The textarea has `rows="1"` and grows while focused, up to six lines (`field-sizing: content` with a `max-height`, and a JS height fallback for Firefox), so the line the cursor moves to stays visible.

Moving into a result field of another column makes that column the active one through the `focusin` of D5. So the arrows never need to know about opening and closing.

Enter in a note field is left to the textarea: it inserts a line break and moves nothing, because the down arrow on the last line already moves on (Gerald, 2026-11-07). Enter in a result field (`input.sl-exam-cell`) is new: `arrowKey` treats it as `ArrowDown`, so a column of values can be typed down the class with Enter. The online-test columns' result cells still have no input, so the existing skip loop keeps passing over them. Their note fields, however, are found while the column is open.

### D7: How the student and the teacher's record show it

In the student's results (`exam/client/gradebook.js`, the entries list), an entry's `note` is shown below its line in a `<p class="sl-exam-result-note">` with `white-space: pre-line`, muted, in the entry's own cell spanning the row. A note-only item shows its name and date with `–` as the result. The teacher's student page does the same, read-only.

## Risks / Trade-offs

- [A 20-character field shows little of a long note] → The field grows to six lines while focused, and the mark's `title` shows the whole note on hover. The student's page shows it in full.
- [Opening a column makes the sheet wider and the scroll jumps] → Only one column is open at a time. It opens where the focus already is, and `focus()` keeps the focused field in view. If it still jumps in a test, the focusin handler can correct `scrollLeft` by the cell's offset.
- [A note set on an online test for a student who was not in any sitting] → Allowed on purpose (spec: every participant on the roster). It only makes the test's column visible to that student together with the note.
- [Notes are free text about students, so they are personal data] → They are covered by the same retention purge, the same closed-year protection and the same per-student scoping of `resultsOf` as the results. They are never logged.
- [Tab order grows by one stop per cell in the open column] → Only in one column at a time. The marks stay out of Tab order.

## Migration Plan

`016-result-notes.sql` only adds a table, so the pre-migration backup the runner always takes is the rollback. A code rollback with the table left in place is harmless: nothing older reads it.
