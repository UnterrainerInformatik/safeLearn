## Why

The compact sheet of `gradebook-short-tests` is still too wide: the nine-column course measures 1541 px, so on a 1280 px screen the result columns still scroll out of view. Most of the remaining width is the column names, which stretch a column up to 132 px although its result field needs about 64 px, and which are cut with an ellipsis anyway, so the header shows neither the full name nor a narrow column. Empty categories are 181–204 px wide because of their heading. Two smaller defects come with it: the tooltip and the click target are only the header's text, not the whole header cell, and the column dialog (`+` and editing a column) stays light in dark mode.

## What Changes

- A column's header no longer shows its name. It shows its date as day and month and, where the column has one, its maximum. The date is what opens the column's dialog; for an online test it is the link to the test.
- Hovering anywhere over the header cell shows the column's name, full date with the year, and maximum or percent. The whole cell is the click target and is marked on hover, not only the text.
- A category's heading wraps, so a category without columns is no wider than the longest word of its heading.
- The column dialog (new column through `+`, editing a column through its header, for manual tests, short tests, participation and homework) follows the light or dark mode of the page: its background, text, fields and buttons.
- The name stays where it is entered and read: in the column dialog, in the header's tooltip and accessible label, and on the student's own results.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `gradebook-sheet`: the header requirement drops the name from the header text, makes the whole cell the hover and click area and narrows empty categories; the online-test requirement links the header's date; the "names as entered" requirement places the column name in the header's tooltip and dialog; a new requirement makes the column dialog follow light or dark mode.

## Impact

- `exam/client/gradebook.js`: `columnLines`, `columnHead` and their doc comments; the empty-category placeholder.
- `css/exam.css`: header button filling the cell, category heading wrapping, removal of the `.sl-exam-column-name` ellipsis rule, dark-mode rules for `.sl-exam-dialog`.
- `test/exam.test.js`: header text and title checks, a dark-mode check of the dialog.
- `docs-exam-module.md`: the header description.
- No API, data or migration change. The student's page is unaffected.
