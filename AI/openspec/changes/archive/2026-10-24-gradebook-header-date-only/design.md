## Context

- `columnLines(column)` (`exam/client/gradebook.js:125`) returns three spans: `.sl-exam-column-name` (the name, or the day for a column named by its date), the day, and `/max`. `columnTitle(column)` builds the tooltip and already handles a column named by its date.
- `columnHead` (`:312`) puts the tooltip on the `th`. An editable column gets a `button.sl-exam-column-edit` holding the lines; an online test gets `<a>` around the first line (the name); a read-only sheet gets the lines as they are.
- `#markdown-content .sl-exam-sheet th` has `padding: 3px 6px` and `white-space: nowrap` (`css/exam.css:475–482`). The button sits inside that padding with `display: block`, so it covers the width of the cell's content box but not the padding, and not the height left below a shorter column's lines (a participation column has one line where a test column has two). The underline on hover is set on `.sl-exam-column-name` only.
- `.sl-exam-column-name` carries `max-width: 10em` with an ellipsis: the cut names the user saw.
- The category heading `th.sl-exam-category` inherits `white-space: nowrap`, which is why an empty category is as wide as "Online-Tests 20 %" plus its `+`.
- Dark mode is the class `dark-mode` on `body` and `#markdown-content`, set and switched without a reload. The column dialog is appended to the gradebook element, inside `#markdown-content`, and opened with `showModal()`, so `#markdown-content.dark-mode .sl-exam-dialog` matches it. `.sl-exam-dialog` has no colour rule, so the browser's default `Canvas` (white) applies; its inputs are native and unstyled. Buttons (`.sl-exam-action`, `.sl-exam-primary`) and the date picker popup already have dark rules (`:237–282`, `:2008`). No stylesheet sets `color-scheme`.

## Goals / Non-Goals

**Goals:**
- Headers show only day and maximum. The name goes to the tooltip, the button's accessible label and the dialog.
- The whole header cell is the tooltip area, the hover marking and the click target.
- Empty categories narrow down to their heading's longest word.
- The column dialog is dark in dark mode, including its native fields and backdrop.

**Non-Goals:**
- Dark-mode styling of the sheet's own result fields or of other module forms. If they share the defect it goes to the backlog, not into this change.
- Changing the leading columns, the dialog's fields or the student's page.

## Decisions

### D1: `columnLines` drops the name

`columnLines` returns the day (`format.dayMonth`) and, where there is one, `/max`. `namedByDate` is still used by `columnTitle`. The class `.sl-exam-column-name` is replaced by `.sl-exam-column-day` on the day span, which is the element underlined on hover and, for an online test, the one wrapped in the link. The online-test branch becomes `[day, ...rest]` with the `<a>` around `day`.

The button's `aria-label` (`exam.gradebook.editNamedColumn`) keeps the name, so a screen reader still hears which column it opens. The online test's link gets an `aria-label` with the test's name for the same reason (new key `exam.gradebook.openTest`, de and en, BabelEdit format).

*Alternative:* keep a short name (the first few characters). It brings the width back and cuts in the middle of words, which is the state this change removes.

### D2: The button fills the cell

For a header with a button, the `th`'s padding moves onto the button: `#markdown-content .sl-exam-sheet th.sl-exam-column-head:has(> .sl-exam-column-edit)` gets `padding: 0`, the button `padding: 3px 6px; width: 100%; height: 100%; box-sizing: border-box`. A percentage height in a table cell only resolves when the cell has a height, so the `th` gets `height: 1px` (the usual table idiom: the row still grows to its tallest cell, and the cell's content can fill it). `vertical-align: top` stays on the text, via `display: flex; flex-direction: column; justify-content: flex-start` on the button.

The hover underline moves to `.sl-exam-column-edit:hover .sl-exam-column-day`, triggered by the whole button. The online-test link gets the same treatment (`display: block`, padding, full height) so that its whole cell is the link. The `title` stays on the `th`, which already covers the full cell including what the button covers.

*Alternative:* a click handler on the `th`. It makes a non-focusable element clickable and needs keyboard handling the button already has.

### D3: Category headings wrap

`th.sl-exam-category` gets `white-space: normal`. The `+` stays at the end of the heading; the weight may go to its own line. The empty placeholder `th` keeps "–" and gets `width: 1px` in CSS: wrapping alone only narrows the category when the sheet is short of room, and on a wide screen the browser keeps the heading on one line (found by the screenshots of task 3.3). No width is set in JS.

### D4: Dark rules for the dialog

```
#markdown-content.dark-mode .sl-exam-dialog {
  color-scheme: dark;
  background-color: #1e1e1e;
  color: #e2e2e2;
  border-color: #545d68;
}
#markdown-content.dark-mode .sl-exam-dialog::backdrop { background: rgba(0, 0, 0, 0.6); }
#markdown-content.dark-mode .sl-exam-dialog input { background-color: #22272e; color: #e6edf3; border: 1px solid #545d68; }
```

The colours are the page's dark pair from `css/fixes.css` and the date picker's dark field colours, so the dialog matches what is already there. `color-scheme: dark` lets the browser draw anything native left in the dialog (caret, autofill, spinners, scrollbars) dark as well. `.sl-exam-quiet` and the message line already have colours that work on both backgrounds; this is checked in the screenshots (task 3.3).

*Alternative:* setting `color-scheme` on the whole page in dark mode. It would change every native control of the instance at once, which is wider than this change.

## Risks / Trade-offs

- [Columns are no longer told apart by name at a glance] → The user chose this. The date and maximum, the tooltip and the order by date remain; two columns of the same day differ in their maximum or their tooltip.
- [`:has()` in the header rule] → Supported by every browser the instance targets; without it, the button would merely keep the cell's padding as today.
- [`height: 1px` on table cells behaves differently in older engines] → The screenshot check measures the button's box against the cell's box in Chromium; Firefox is checked by hand once.
