## ADDED Requirements

### Requirement: A semester's dates are written as a table rather than typed

The plugin SHALL offer a command that writes a table of lesson dates, so that the part of a semester
table with no judgement in it need not be typed out. The command SHALL ask for the span the table covers
and which weekdays the class meets, and SHALL write the table only once that has been confirmed — a
table of the wrong dates is worse than no table, because it is corrected row by row.

What it asks for SHALL be a start date, an end date, the weekdays to write rows for, and the subject
columns to lay out. The start date SHALL default to the day the command is run, which is the date a
teacher setting up a semester most often starts from.

#### Scenario: The command is invoked

- **WHEN** the semester table command is invoked in an editor
- **THEN** a dialog asks for a start date, an end date, weekdays, and subject columns, and nothing is
  written into the document yet

#### Scenario: The dialog opens

- **WHEN** the dialog opens
- **THEN** the start date already holds the current day

#### Scenario: The dialog is dismissed

- **WHEN** the dialog is closed without generating
- **THEN** the document is unchanged

### Requirement: The table is written in the shape the corpus already uses

The table SHALL carry, in this order: a marker column whose heading is empty, a column of weekdays, a
column of dates, the subject columns as they were given, and an `Info` column. It SHALL be a table the
renderer reads as one — a heading row, a delimiter row beneath it, and one row per lesson.

The headings the command supplies itself SHALL read `Day`, `Date` and `Info`, and dates SHALL be written
as `dd.MM.yyyy`. The semester files in the corpus are already written this way, and a command that
generated a second spelling would make the corpus disagree with itself over which one is the format.

A subject column SHALL be asked for as the two halves the headings in the corpus are made of — the
subject, and who takes it — and the two SHALL be written as one heading with a line break between them
(`0WMC<br>(UNTEG)`). That line break is markup, and a dialog that expected a person to type it would be
asking them to know the format the dialog exists to spare them. Where only one half is given, the
heading SHALL be that half alone: a line break written above nothing leaves a heading sitting high in
its row, and somebody who filled in one field meant one line.

Each half SHALL otherwise be written exactly as it was given. What belongs in a heading beyond its two
halves is the author's to decide; a command that reformatted it would be deciding it instead.

#### Scenario: A table is generated

- **WHEN** the dialog is generated from
- **THEN** a table is written whose columns are, in order, the marker column with an empty heading, `Day`,
  `Date`, each subject column given, and `Info`

#### Scenario: A row is written

- **WHEN** a row is written for a date
- **THEN** its weekday stands in the `Day` column in short form, its date in the `Date` column as
  `dd.MM.yyyy`, and its subject and info cells are empty

#### Scenario: Subject columns are given

- **WHEN** a subject and who takes it are given for a column
- **THEN** that column's heading stands between `Date` and `Info`, in the order given, carrying both
  halves as they were written with a line break between them

#### Scenario: Only one half of a heading is given

- **WHEN** a subject column is given a subject but nobody to take it, or the other way round
- **THEN** its heading is the half that was given, with no line break and no empty second line

#### Scenario: No subject column is given

- **WHEN** the dialog is generated from with no subject column named
- **THEN** a well-formed table is still written, carrying the marker column, `Day`, `Date` and `Info`

### Requirement: Every date in the range is written and none is skipped

For each date from the start date to the end date whose weekday was ticked, the command SHALL write one
row, in chronological order. Both ends of the range SHALL be included where their weekday was ticked.

The command SHALL NOT leave a date out on account of it being a holiday or otherwise not taught. It
SHALL hold no calendar of school holidays: those are local and change from year to year, so a calendar
carried in the plugin would be wrong somewhere and would go stale. More than that, the rows are not
waste — an unbroken run of weeks is the overview the table exists to give, and a break in the teaching
is written *into* the row it falls on, by the person who knows what the break is.

#### Scenario: A range covering several weeks is generated

- **WHEN** a range is generated for with one weekday ticked
- **THEN** there is one row for every occurrence of that weekday in the range, a week apart, in
  chronological order

#### Scenario: More than one weekday is ticked

- **WHEN** a range is generated for with several weekdays ticked
- **THEN** every occurrence of each of them is written, and the rows are in date order rather than
  grouped by weekday

#### Scenario: The range begins or ends on a ticked weekday

- **WHEN** the start date or the end date itself falls on a ticked weekday
- **THEN** that date has a row

#### Scenario: A holiday falls inside the range

- **WHEN** a ticked weekday falls on a school holiday inside the range
- **THEN** its row is written like any other, and the table has no gap

### Requirement: The first lesson is marked

The first data row SHALL be written with the marker already in its first column, and every other row
SHALL be written with that column empty. The marker is how the table says which lesson is next, and at
the moment the table is generated that is its first row.

There is no cell background in Markdown, which is why the marker is a character in a column of its own
rather than a highlighted row.

#### Scenario: A table is generated

- **WHEN** a table with at least one row is written
- **THEN** the first data row carries the marker in its first column and the remaining rows have that
  column empty

### Requirement: A span that describes no lessons writes no table

Where the end date falls before the start date, or where no weekday was ticked, there are no rows to
write, and the command SHALL NOT write a table. A heading row over nothing is not a semester table; it
is a thing to delete before the dialog can be answered properly.

#### Scenario: The end date is before the start date

- **WHEN** an end date earlier than the start date is generated from
- **THEN** no table is written into the document

#### Scenario: No weekday is ticked

- **WHEN** the dialog is generated from with no weekday ticked
- **THEN** no table is written into the document

#### Scenario: The range holds no occurrence of a ticked weekday

- **WHEN** a range too short to contain any ticked weekday is generated from
- **THEN** no table is written into the document

### Requirement: Generating a table never costs the author text they had selected

Where the command is invoked with text selected, that text SHALL survive: the table SHALL be written
without replacing it. A table has no place to enclose a selection the way a side-by-side block or a
restricted section does — it is a grid of empty cells, not a wrapper — so the selection is neither
enclosed nor consumed.

#### Scenario: The command is invoked with text selected

- **WHEN** a table is generated with text selected in the editor
- **THEN** the selected text is still in the document, and the table stands alongside it
