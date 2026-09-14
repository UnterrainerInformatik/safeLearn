## Context

See proposal.md — Why. What matters for the approach is that none of the machinery is new:

- `AUTHORING_COMMANDS` (`AI/plugin/main.ts`, ~line 3045) is the one list `onload` builds both the command
  palette entries and the context menu from. An entry there is a command in both places by construction.
- `writeLines(editor, lines, cursorLine)` already handles what the capability requires of every
  insertion: it begins on a line of its own, it refuses to push a gating directive off line 1, and it
  places the cursor afterwards.
- `ColumnCountModal` (~line 3217) is the shape of a dialog that asks before inserting: build the fields
  in `onOpen`, confirm on Enter and on a button in `modal-button-container`, close before calling back.
- The date handling already in the file (`readsAsTime`, ~line 1925) builds dates from local components —
  `new Date(year, month - 1, day)` — rather than parsing a string. That is the pattern to follow, and the
  comment above it is there because the alternative went wrong in both directions.

The table format is not being designed here either; it is read off the corpus. Every current semester
file (`md/*/26-27 - * - WS.md`) carries the same table: an empty leading heading with `x` in the first
data row, `Date` as `dd.MM.yyyy`, subject columns headed `0WMC<br>(UNTEG)`, and `Info` last.

## Goals / Non-Goals

**Goals:**

- One further entry in `AUTHORING_COMMANDS` and one modal beside the two already there — no new
  extension point, no new file, no dependency.
- Dates correct across daylight-saving boundaries and independent of the machine's locale and timezone:
  the corpus is shared, so the same inputs must produce the same table for anyone who runs the command.
- A table that is already aligned in the source, the way Obsidian's own table editor leaves one.

**Non-Goals:**

- A date library. Two date fields and a day-by-day walk do not earn a dependency in a plugin that ships
  as a single bundled `main.js`.
- Any knowledge of school terms or holidays — see the spec's requirement on skipping nothing.
- Re-reading or updating a table that already exists. The command writes one; maintaining it is the
  teacher's, as it is today.

## Decisions

### Dates are built from components, never parsed from a string

`<input type="date">` hands out `yyyy-MM-dd`. `new Date("2026-09-21")` reads that as **UTC midnight**,
which in any timezone west of UTC is the previous day once read back with `getDate()` — a whole table
shifted by one day, and shifted only for some of the people running it. So the value is split on `-` and
fed to `new Date(year, month - 1, day)`, which is local midnight and the same calendar day everywhere.
This is what `readsAsTime` already does, for the same reason.

*Alternative considered:* keeping everything in UTC (`Date.UTC`, `getUTCDay`). It works, but it means
every read of the date has to remember to use the UTC getter, and one plain `getDate()` slipped in later
reintroduces the bug silently. Local components keep the ordinary getters correct.

### The walk advances by calendar day, not by 24 hours

Iteration is `date.setDate(date.getDate() + 1)`. Adding `86_400_000` milliseconds drifts by an hour
across a daylight-saving boundary, and since both the start of the summer term and the end of the winter
term sit right next to one, a semester-long range crosses one nearly every time. `setDate` moves the
calendar field and lets the runtime resolve the clock.

Weekday membership is `getDay()` against the ticked set. Cost is one iteration per day of the range —
a few hundred for a semester, which is nothing.

### Weekday names are a fixed English list, not the locale's

`["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]`, indexed by `getDay()`. Not
`toLocaleDateString(undefined, { weekday: "short" })`: that yields `Mo`/`Di` on a German machine and
`Mon`/`Tue` on an English one, so two teachers editing the same class file would write two spellings into
the same column. The corpus is shared and its headings are already English; the weekday column matches.

The checkboxes in the dialog are offered Monday-first, which is how a school week reads here, while the
array stays Sunday-indexed because `getDay()` is.

### The table is written aligned, and cell width is computed from the content

Each column is padded to the width of the longest of its heading and its cells, and the delimiter row is
filled with dashes to the same width. This is what the existing tables look like, and what Obsidian's
table editor would reformat an unaligned table into on the first edit anyway — so writing it unaligned
just means the first edit produces a large diff of pure whitespace.

The marker column is at least one character wide, so `x` fits and the empty heading stays a cell.

### The dialog asks for the two halves of a heading, and writes the `<br>` itself

The headings in the corpus are a subject over the teachers who take it — `0WMC<br>(UNTEG)`. The `<br>`
between them is markup, and asking a teacher laying out a semester to type markup into a dialog is
asking them to know a detail of the format the dialog is there to spare them. So a subject column is two
fields on a line, and the plugin joins them. Either half alone is that half: a `<br>` above nothing
leaves a heading sitting high in its row, and somebody who filled in one field meant one line.

The rows grow as they are filled — three to begin with, which is as many as the fullest class file in
the corpus carries, and a further one as soon as the last is used. Nobody counts empty rows before
starting, and nobody runs out.

Beyond the join nothing is normalized: what goes in either half is the author's to decide. An unescaped
`|` is the exception, because it would split the cell and shift every column after it, turning one bad
heading into a broken table. It is written as `\|`. A row with neither half filled in contributes no
column; a half is trimmed of surrounding whitespace only.

### The table is separated from what is above it by a blank line

`writeLines` guarantees the insertion begins on a line of its own; a table needs one more thing — a blank
line above it, or a parser reading a table directly under a paragraph may take the heading row as part of
that paragraph. So a blank line is written ahead of the heading row when the line above is not already
blank. Obsidian's own renderer is lenient here, but the corpus is also rendered by the server, and the
document should not depend on which of the two is more forgiving.

### A selection is left where it is

`writeLines` replaces the range from `getCursor("from")` to `getCursor("to")`, so invoking the command
with text selected would consume it. `insertSectionsPerName` already faces this and collapses the cursor
to `from` first; the same line does it here. A grid of empty cells has nothing to enclose a selection
with, so this is the whole of the interaction between the two.

### Name, id and icon

Id `insert-semester-table`, name `Semester table…` — the ellipsis marks a command that asks, as
`Side-by-side, n columns…` and `Restricted section per name…` already do. Icon `calendar-days`: the
entry's icon says what the command is *about*, and `table` would name the container while saying nothing
about a semester of dates.

### Nothing is written until the dialog can produce rows

The dialog validates on confirm: both dates readable, end not before start, at least one weekday ticked.
Where it cannot produce a row it closes without writing, per the spec — the rule lives in the generating
function rather than only in the dialog's validation, in the manner of `insertSideBySide`'s
`if (columns < 2) return;`.

## Risks / Trade-offs

- **`<input type="date">` renders in the browser's locale, not Obsidian's.** The picker may present
  `09/21/2026` to someone whose Chromium is set to US English while the table it writes reads
  `21.09.2026`. → Accepted: the field's *value* is always ISO, so the table is unaffected, and the
  written format is fixed by the corpus. The field is labelled with the format it writes.
- **A very long range writes a very large table** (nothing caps the end date). → Accepted: a semester is
  a few dozen rows, and a wrong end date is visible immediately and undone with one Ctrl+Z.
- **Alignment padding makes the source lines long** once a subject heading carries `<br>` markup. → This
  is already true of every table in the corpus; matching it is what keeps diffs small.
- **The plugin has no test runner** (`npm test` is the placeholder from `npm init`). The date walk is the
  one part with real edge cases — DST, month and year boundaries, both ends of the range. → Verified by
  hand against a written list of cases in tasks.md, in the vault, before release.

## Migration Plan

No migration: the command is additive, writes plain Markdown, and nothing reads a table it produced.
Existing tables are untouched — this writes new ones and never edits one.

Shipping follows the usual plugin release: version bumped in the three places, pushed, tagged, GitHub
release carrying `main.js`, `manifest.json` and `styles.css`. The safeLearn vault sees it immediately
through the symlink; other vaults pick it up once Obsidian's index catches up.
