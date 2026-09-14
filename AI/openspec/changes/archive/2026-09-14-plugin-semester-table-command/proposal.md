## Why

Every class has a file holding one table that carries the semester: a row per lesson, the date, what was
covered, and a leading `x` marking the next lesson to come — `md/4BHIF/26-27 - 4BHIF - WS.md` and its
siblings. It is the one place a student can look to see what they missed, how much time a topic took, and
how much semester is left. Markdown has no cell background, so the `x` is how *here we are* gets said.

The table is built by hand. The part that costs the most is the part with no judgement in it: typing out
every date of the semester, a week apart, for each weekday the class meets. A command can write that
scaffold, and leave the teacher the columns that need thinking.

## What Changes

- A further authoring command, `Semester table…`, joins `AUTHORING_COMMANDS` and is therefore offered in
  both the command palette and the editor's context menu without either being maintained separately.
- It opens a dialog that asks for a start date (today by default), an end date, the weekdays the class
  meets as checkboxes, and the subject columns to lay out — then writes the table on **Generate**.
- The table it writes carries a leading marker column with an empty heading, a weekday column, a date
  column, the given subject columns, and an `Info` column. The first data row already carries the `x`.
- Every date in the range whose weekday was ticked gets a row, in chronological order.

Decisions taken with Gerald, recorded here so the specs do not have to re-argue them:

- **No `Teacher` column.** The original sketch had one; the tables actually in the corpus carry the
  teacher's short sign in the *column heading* instead (`0WMC<br>(UNTEG)`), because which teacher takes a
  slot is a property of the slot, not of the week. The dialog asks for those headings and writes them
  verbatim.
- **Column order** is `(marker) | Day | Date | <subject columns…> | Info`. The request described the
  weekday as column 2 in one sentence and column 3 in another; the first, complete enumeration governs.
- **Dates read `dd.MM.yyyy`** and the fixed headings are English (`Day`, `Date`, `Info`) — both as the
  current semester files already have them.
- **No holiday knowledge.** School holidays are local and change yearly; a calendar built into a plugin
  would be wrong somewhere and stale eventually. More to the point, those rows are not waste: Gerald
  never deletes them, he writes `--- Semesterferien ---` into them. An unbroken week-by-week run *is*
  the overview the table exists to give, so the generator emits every matching date and skips nothing.

## Capabilities

### New Capabilities

None. The command is another entry in a set that already has a capability describing it.

### Modified Capabilities

- `plugin-authoring-commands`: gains the requirements for a command that generates a dated table — what
  the dialog asks, what shape the table has, which dates become rows, and that no date in range is
  omitted. The capability's existing requirements about insertion (each insertion begins on a line of its
  own, a gating directive on line 1 is never displaced, every command is reachable from palette and
  context menu and carries an icon) already cover this command and are not restated.

## Impact

- `AI/plugin/main.ts` — one entry in `AUTHORING_COMMANDS` (~line 3045), one new modal in the manner of
  `ColumnCountModal`, and the date/table generation behind it. The plugin lives in its own repository,
  reached through the gitignored `AI/plugin` symlink; the spec stays here in safeLearn.
- No server, corpus, or renderer change: the command writes plain GitHub-flavoured Markdown that every
  surface already renders. Nothing about who may read a document changes.
- A release of the plugin follows implementation, by the usual procedure (version in three places, push,
  tag, GitHub release with `main.js`, `manifest.json`, `styles.css`).
