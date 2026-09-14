## Context

See proposal.md — Why. What shapes the approach is where the two pieces of knowledge sit today.
`subjectHeading(subject, teachers)` joins the two halves and is the only place a heading is formed.
`semesterTableLines(dates, subjects)` builds every cell from the dates alone; how many weekdays were
ticked is known one level up, in `insertSemesterTable(editor, start, end, weekdays, subjects)`, and is
not passed down. The dialog itself already hands the ticked set out (`SemesterTableModal`'s `onGenerate`).

Column widths, the delimiter row and the `x` in the first data row are all derived from the `headings`
array inside `semesterTableLines`, so a column that is never put into that array disappears from all
three without anything else being touched.

## Goals / Non-Goals

**Goals:**

- The parentheses rule lives in `subjectHeading`, the one function that forms a heading, so that it holds
  for every caller and for the tests that exercise it directly.
- The weekday column's presence is decided once, from what was ticked, and everything derived from the
  headings follows.

**Non-Goals:**

- No change to which rows are written, to their order, or to the marker column.
- No change to the date fields or their format — that was looked at on 2026-09-14 and left as it is: the
  native picker renders in the locale of the process, not of the element, so nothing in the plugin's
  reach changes it.
- No rework of the subject rows in the dialog (three to begin with, a fourth as the third is used). It
  works as it stands.

## Decisions

**The ticked count is passed down, not derived from the dates.** `semesterTableLines` gains a parameter
saying whether the weekday column is wanted; `insertSemesterTable` computes it from the `weekdays` set it
already holds. The alternative — `new Set(dates.map((date) => date.getDay())).size === 1` inside
`semesterTableLines` — needs no signature change and looks tidier, but it answers a different question:
it would drop the column from a Mon+Thu table whose range is too short to contain a Thursday. The spec
ties the column to what was ticked precisely so that the answer does not move with the end date.

**A half counts as already bracketed when it begins with `(` and ends with `)`.** Anything looser (a `(`
anywhere in it) would leave `(UNTEG+LANDH` alone, which is a half missing its closing bracket, not a
bracketed one. Anything stricter (matching balanced pairs) would be reading a grammar into a field that
holds two or three short signs. Trimmed first, as the halves already are today.

**The wrapping happens in `subjectHeading`, not in `subjectHeadings`.** The latter is the escape-and-drop
pass over headings that are already formed; it does not know which half it is looking at any more.

## Risks / Trade-offs

- **A teacher who wants a heading without brackets can no longer have one.** → Accepted, and Gerald's
  call: every heading in the corpus carries them. The escape hatch remains the document itself, where the
  heading is one edit away.
- **A table generated for one weekday and later extended to a second** has no `Day` column to write the
  second weekday into. → Accepted: the column is added back by regenerating, and a table being reshaped
  by hand is being edited by someone who can add a column.
- **Existing tests assert the current shape** — the end-to-end test generates for `Mon` alone and expects
  `Day` among its headings. → Both halves of the rule need covering: that test becomes the
  without-`Day` case and a second ticked weekday carries the with-`Day` case.

## Migration Plan

None. Tables already in the corpus are untouched; the change affects only tables written from now on.
A plugin release follows implementation by the usual procedure.
