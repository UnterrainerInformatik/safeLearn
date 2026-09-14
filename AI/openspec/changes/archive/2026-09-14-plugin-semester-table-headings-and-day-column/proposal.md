Source: AI/open-proposals.md — "Semester-Tabelle: vier Nachbesserungen"

## Why

The semester table command shipped on 2026-09-14 and was used for real for the first time. Two things
about its dialog turned out to ask the teacher for work the command exists to take off them.

The subject heading in the corpus reads `0WMC<br>(UNTEG)`, and the dialog already spares the person the
`<br>` — it asks for the two halves and joins them. It does not spare them the parentheses: the teacher
half is written exactly as typed, so `(UNTEG)` has to be typed with its brackets, or the heading comes
out unlike every other heading in the corpus. The brackets are part of the format, the same as the `<br>`
is, and they belong on the same side of the dialog.

The second is the `Day` column. A subject usually meets on one weekday, and then that column repeats the
same three letters down the whole semester — a column of one value, costing width in a table that is
already wide, and saying nothing the `Date` column beside it does not.

## What Changes

- The plugin puts the parentheses around the teacher half of a subject heading. `0WMC` + `UNTEG` becomes
  `0WMC<br>(UNTEG)`. A half that already carries its brackets is left alone, so nobody who types them out
  of habit ends up with `((UNTEG))`. The field's placeholder changes from `(UNTEG)` to `UNTEG` to say so.
- Where exactly one weekday is ticked, the table is written without its `Day` column: the columns are
  then the marker column, `Date`, the subject columns, and `Info`. With two or more ticked weekdays
  nothing changes — the column is written as it is today.

Decisions taken here, recorded so the specs need not re-argue them:

- **The trigger is what was ticked, not what the range happens to contain.** A table generated for
  Mondays and Thursdays over a span so short that only a Monday falls in it still carries its `Day`
  column. What the person ticked is what the table is *for*, and a rule read off the dialog is one a
  person can predict before pressing Generate; a rule read off the rows would make the column appear and
  disappear with the end date.
- **The brackets belong to the teacher half, not to the joining.** Where only the teacher half is given,
  the heading is `(UNTEG)` — the existing rule that a lone half stands alone, with the new wrapping
  applied to it. The subject half is untouched: no brackets, no normalization, exactly as given.
- **Nothing else about the headings is normalized.** Escaping a `|` stays the one change the command
  makes to what was typed, for the reason it always was: an unescaped pipe breaks the table rather than
  itself.

## Capabilities

### New Capabilities

None. Both changes are to requirements a capability already carries.

### Modified Capabilities

- `plugin-authoring-commands`: the requirement "The table is written in the shape the corpus already
  uses" changes twice — the teacher half of a subject heading is now written in parentheses rather than
  exactly as it was given, and the column list becomes conditional, with the weekday column written only
  where more than one weekday was ticked. The requirement about which dates become rows is unaffected:
  the same rows are written either way, they are simply written with one column fewer.

## Impact

- `AI/plugin/main.ts` — `subjectHeading()` (~3902) gains the wrapping; `semesterTableLines()` (~3937) and
  its caller `insertSemesterTable()` (~3982) need to know how many weekdays were ticked, which the modal
  already hands out (`SemesterTableModal`, ~4022); the teachers field's placeholder (~4080). The plugin
  lives in its own repository, reached through the gitignored `AI/plugin` symlink; the spec stays here.
- `test/semester-table.test.js` — the column list (~252), the table with no subject column (~277) and the
  `subjectHeading` cases (~332) all assert the current shape. The single-weekday fixtures used elsewhere
  in that file produce tables with one column fewer from now on.
- `test/obsidian/plugin.test.js` — the end-to-end table test (~2733) generates for one weekday (`Mon`)
  and asserts `Day` among the headings; it becomes the without-`Day` case, and the with-`Day` case needs
  a second ticked weekday.
- No server, corpus, or renderer change: the command still writes plain Markdown, and tables already in
  the corpus are untouched — this writes new ones and never edits one.
- A release of the plugin follows implementation, by the usual procedure (version in three places, push,
  tag, GitHub release with `main.js`, `manifest.json`, `styles.css`).
