## 1. The date walk

- [x] 1.1 Add a helper that reads a `yyyy-MM-dd` field value into a local-midnight `Date` via
      `new Date(year, month - 1, day)`, returning null for an empty or unreadable value — never
      `new Date(string)` (design.md — Dates are built from components)
- [x] 1.2 Add a helper that walks start to end inclusive with `setDate(getDate() + 1)`, collecting each
      date whose `getDay()` is in the ticked set, in chronological order
- [x] 1.3 Return an empty list when the end is before the start or the ticked set is empty, so the
      no-table rule holds in the generating code and not only in the dialog's validation
- [x] 1.4 Add the fixed `["Sun", …, "Sat"]` short-name array indexed by `getDay()`, with a comment saying
      why it is not `toLocaleDateString`

## 2. Table generation

- [x] 2.1 Build the header row: empty marker heading, `Day`, `Date`, the given subject headings, `Info`
- [x] 2.2 Format each row as marker (`x` on the first data row, empty elsewhere), weekday short name, and
      date as `dd.MM.yyyy` with zero-padded day and month, with the subject and info cells empty
- [x] 2.3 Escape `|` as `\|` in subject headings; trim them and drop empty entries
- [x] 2.4 Pad every cell to its column's width — the longest of heading and cells, marker column at least
      one character — and fill the delimiter row with dashes to match
- [x] 2.5 Prepend a blank line when the line above the insertion point is not already blank

## 3. The dialog

- [x] 3.1 Add a modal in the manner of `ColumnCountModal`: start date (`<input type="date">`, defaulting
      to today), end date, a Monday-first row of weekday checkboxes, one row of two fields per subject
      column — the subject and who takes it, joined with `<br>` by the plugin rather than typed, and
      growing by a row as the last is filled in — and a **Generate** button in `modal-button-container`
- [x] 3.2 Label the date fields with the format they produce (`dd.MM.yyyy`), since the picker renders in
      the browser's locale rather than that format
- [x] 3.3 Confirm on the button and on Enter in a single-line field; close before calling back, as the
      existing modals do
- [x] 3.4 Refuse to generate with unreadable dates, an end before the start, or no weekday ticked —
      leaving the dialog open rather than closing on nothing

## 4. The command

- [x] 4.1 Add the `insert-semester-table` entry to `AUTHORING_COMMANDS` — name `Semester table…`, icon
      `calendar-days` — so palette and context menu both carry it from the one list
- [x] 4.2 Collapse the cursor to `getCursor("from")` before writing, so a selection is not replaced
      (as `insertSectionsPerName` does)
- [x] 4.3 Write through `writeLines`, placing the cursor on the first data row
- [x] 4.4 `npm run build` and confirm the bundle builds clean

## 5. Verification in the vault

Run rather than clicked through. The checks live in two places: `test/obsidian/plugin.test.js`, which
drives a real Obsidian over the debugging protocol (`npm run test:obsidian`), and
`test/semester-table.test.js`, which calls the plugin's own date walk out of `main.ts` (`npm test`).

- [x] 5.1 Palette and context menu both offer the entry, and it carries its icon — the three
      menu/palette checks read every command Obsidian holds, and the icon is read off the drawn
      element rather than off the name that was asked for
- [x] 5.2 One weekday over a semester: rows exactly a week apart, both ends of the range included when
      they fall on that weekday, chronological, no gap at the Christmas holidays — over the winter
      semester the class files carry, 21.09.2026 to 08.02.2027
- [x] 5.3 Several weekdays ticked: rows interleaved in date order, not grouped by weekday
- [x] 5.4 A range crossing the daylight-saving switch (late October, late March): no date repeated, none
      skipped, no drift in the weekday column — both switches, in five timezones including one whose
      clocks skip midnight, and the same span writes a byte-identical table in every one of them
- [x] 5.5 A range crossing a month and a year boundary: dates roll over correctly
- [x] 5.6 The generated table renders as a table in reading view and in the server's rendering, including
      when it is inserted directly under a paragraph — the reading view in the Obsidian suite, the
      server's side through `marked` under the configuration app.js gives it
- [x] 5.7 The first data row carries `x`, the rest have that column empty
- [x] 5.8 Subject headings containing `<br>` and one containing `|` both survive with the table intact —
      the `<br>` is the plugin's to write since 3.1, and is checked as such; the `|` escape is checked
      in both suites, together with the column count staying right across every line
- [x] 5.9 Invoked at the very start of a file whose first line is a `@@@` directive: the directive stays
      on line 1 — folded into the existing check that says this of *no* command, so the claim stays
      about all of them
- [x] 5.10 Invoked with text selected: the selection is still there afterwards
- [x] 5.11 End before start, and no weekday ticked: nothing is written — in the generating code, and
      through the dialog, which stays open and says what is wrong rather than closing on nothing
- [x] 5.12 Generated into a real class file next to its existing hand-written table: the two are the same
      shape, and Obsidian's table editor leaves the generated one alone on first edit — the table
      editor half is checked in the Obsidian suite: an edit widens only the column that was typed in
      and leaves every other column at the width it was written with. The shape was compared against
      `secureLectures/md/4BHIF/26-27 - 4BHIF - WS.md`, which it matches cell for cell apart from the
      `Day` column this change adds

## 6. Release

- [x] 6.1 Bump the version in the three places, push, tag, and cut the GitHub release with `main.js`,
      `manifest.json` and `styles.css` — 1.0.15,
      https://github.com/UnterrainerInformatik/safeLearn-Obsidian-plugin/releases/tag/1.0.15
