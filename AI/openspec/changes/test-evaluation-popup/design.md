## Context

The sheet's data comes from `courseEntries` (`exam/gradebook.js`). It already gives every result of a course as an entry with its fraction (`value`) and its `grade`. Online tests come from `onlineEntries`, as submitted attempts only. An offline test's factor A:B is applied by `groupRaise`. A column is addressed by its sheet key: a number for a manual column, `test-<id>` for an online test (`noteColumn`). Offline tests are manual columns with a `test_id`. The test page (`TestDetail` in `exam/client/tests.js`) does not load the sheet. The sheet's column dialog (`columnDialog` in `exam/client/gradebook.js`) is a `<dialog class="sl-exam-dialog sl-exam">` opened with `showModal()`. It already follows light and dark mode.

## Goals / Non-Goals

**Goals:**
- One computation of the numbers, used by both entry points. Then the sheet and the test page cannot disagree.
- One popup component, shared by the sheet and the test page.

**Non-Goals:**
- Live updates while the popup is open. It is a snapshot taken when it opens (spec).
- Evaluating several columns together, a category, or a semester.
- Exporting or printing the evaluation.
- Splitting a course into several classes. A course is one class (`class-roster`).

## Decisions

### D1 — Computed on the server, from `courseEntries`

`evaluateColumn(db, courseId, columnKey)` resolves the key the way `noteColumn` does (a manual id or `test-<id>`). It refuses columns outside the online-test, manual-test and short-test categories, and columns of a category not in use, with `NotFoundError`. It then filters `courseEntries(db, course, scale)` to that column, so `groupRaise` and the online-only-submitted rule come for free. It returns:

```
{ column: { key, name, date, category }, distribution: { 1: n, …, 5: n },
  results: n, missing: n, averageGrade: number|null, averageFraction: number|null }
```

`missing` is the roster's students who have not left and have no entry in the column. The averages are `null` without a result. Rounding and locale formatting happen on the client. The server sends the unrounded means.

*Alternative:* compute in the browser from the sheet's data. Rejected: the test page does not have that data, and a second implementation of the factor and online rules would drift.

### D2 — One endpoint under the gradebook routes

`GET /api/courses/:id/columns/:column/evaluation`, gated by `requireTeacher` like the rest of `routes-gradebook.js`. A student gets the gate's refusal. The test page knows its column key: `test-<id>` for an online test. For an offline test it is the id of the manual column that carries its `test_id`. `GET /api/tests/:id` gains a `column` field (the sheet key, or `null` while the test has no column). The page then needs no lookup of its own, and the button's presence follows "has a column" exactly.

### D3 — A shared popup module `exam/client/evaluation.js`

`openEvaluation(host, courseId, columnKey)` fetches the endpoint, builds a `<dialog class="sl-exam-dialog sl-exam sl-exam-evaluation">` and calls `showModal()`. Escape is native. A click on the backdrop (a click whose target is the dialog itself) and the close button call `close()`. On `close`, the dialog removes itself, as `columnDialog` does. The bars are `<div>`s whose width is `count / max(count)` and whose tone comes from `gradeTone` (`row-tone.js`) via `setTone`. That keeps the colours identical to the rows and the scale. Each bar has its number as text beside it. The averages are formatted with `Intl.NumberFormat(locale)`: one fraction digit for the grade, a whole percentage for the fraction.

*Alternative:* a hover popover on the header. Rejected: it cannot be reached on a tablet, and the sheet's header hover already shows the column's details.

### D4 — The header button sits beside the existing control

`columnHead` gets an evaluation button (a small icon, `aria-label` "Evaluation of <name>") for evaluable columns. It is appended after the header button or online link, the same way the offline test's `↗` link is. It is not nested inside them, because a button inside a button or a link is invalid HTML and would swallow the click. The sheet's arrow-key navigation only walks the result fields, so the extra button does not disturb it. It is reachable with Tab.

### D5 — The test page's button

`TestDetail` renders an "Evaluation" action button in `sl-exam-test-actions` for online tests and in the corresponding actions row of `renderOffline`, when `test.column` is not `null`.

## Risks / Trade-offs

- [The header gets wider by the icon] → a single small glyph button, styled like the `↗` link. The browser check compares a nine-column sheet's width before and after, with a tolerance.
- [A column of a category set to 0 % has no sheet column] → the endpoint answers 404 for it, and the test page does not offer the button (`column` is `null` then).
- [`courseEntries` loads the whole course for one column] → courses hold at most a few thousand entries. Fine for an on-click request. No caching.
