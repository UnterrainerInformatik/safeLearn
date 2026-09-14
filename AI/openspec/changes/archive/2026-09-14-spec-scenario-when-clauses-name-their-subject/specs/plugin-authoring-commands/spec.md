## MODIFIED Requirements

### Requirement: The table is written in the shape the corpus already uses

The table SHALL carry, in this order: a marker column whose heading is empty, a column of weekdays where more than one weekday was ticked, a column of dates, the subject columns as they were given, and an `Info` column. It SHALL be a table the renderer reads as one — a heading row, a delimiter row beneath it, and one row per lesson.

Where exactly one weekday was ticked, the weekday column SHALL be left out. Every row would carry the same three letters, and a column of one value costs width in a table that is already wide while saying nothing the date beside it does not. Whether the column is written SHALL follow from what was ticked and not from which weekdays the range happens to contain, so that it is answered by the dialog rather than by the end date: a table for Mondays and Thursdays keeps its weekday column even over a span short enough to hold only a Monday.

The headings the command supplies itself SHALL read `Day`, `Date` and `Info`, and dates SHALL be written as `dd.MM.yyyy`. The semester files in the corpus are already written this way, and a command that generated a second spelling would make the corpus disagree with itself over which one is the format.

A subject column SHALL be asked for as the two halves the headings in the corpus are made of — the subject, and who takes it — and the two SHALL be written as one heading with a line break between them (`0WMC<br>(UNTEG)`). That line break is markup, and a dialog that expected a person to type it would be asking them to know the format the dialog exists to spare them. Where only one half is given, the heading SHALL be that half alone: a line break written above nothing leaves a heading sitting high in its row, and somebody who filled in one field meant one line.

The half naming who takes the subject SHALL be written in parentheses — `UNTEG` written as `(UNTEG)` — and a half that already carries them SHALL be written as it stands rather than bracketed a second time. The parentheses are part of the form every heading in the corpus has, exactly as the line break is, and a dialog that asked a person to type them would be asking them for the format it exists to spare them.

Each half SHALL otherwise be written exactly as it was given. What belongs in a heading beyond its two halves is the author's to decide; a command that reformatted it would be deciding it instead.

#### Scenario: A table is generated

- **WHEN** a table is generated from the dialog with more than one weekday ticked
- **THEN** a table is written whose columns are, in order, the marker column with an empty heading, `Day`, `Date`, each subject column given, and `Info`

#### Scenario: The class meets on one weekday

- **WHEN** a table is generated from the dialog with exactly one weekday ticked
- **THEN** the table carries no `Day` column: its columns are, in order, the marker column with an empty heading, `Date`, each subject column given, and `Info`

#### Scenario: A row is written

- **WHEN** a row is written for a date
- **THEN** its date stands in the `Date` column as `dd.MM.yyyy`, its weekday stands in the `Day` column in short form wherever that column is written, and its subject and info cells are empty

#### Scenario: Subject columns are given

- **WHEN** a subject and who takes it are given for a column
- **THEN** that column's heading stands between `Date` and `Info`, in the order given, carrying the subject as it was written over who takes it in parentheses, with a line break between them

#### Scenario: Who takes the subject is given with parentheses already

- **WHEN** the half naming who takes the subject is given already carrying its parentheses
- **THEN** the heading carries that half as it was given, with one pair of parentheses and not two

#### Scenario: Only one half of a heading is given

- **WHEN** a subject column is given a subject but nobody to take it, or the other way round
- **THEN** its heading is the half that was given, in parentheses where it is the half naming who takes it, with no line break and no empty second line

#### Scenario: No subject column is given

- **WHEN** a table is generated from the dialog with no subject column named
- **THEN** a well-formed table is still written, carrying the marker column, `Date` and `Info`, and `Day` where more than one weekday was ticked

### Requirement: Every date in the range is written and none is skipped

For each date from the start date to the end date whose weekday was ticked, the command SHALL write one row, in chronological order. Both ends of the range SHALL be included where their weekday was ticked.

The command SHALL NOT leave a date out on account of it being a holiday or otherwise not taught. It SHALL hold no calendar of school holidays: those are local and change from year to year, so a calendar carried in the plugin would be wrong somewhere and would go stale. More than that, the rows are not waste — an unbroken run of weeks is the overview the table exists to give, and a break in the teaching is written *into* the row it falls on, by the person who knows what the break is.

#### Scenario: A range covering several weeks is generated

- **WHEN** a table is generated for a range with one weekday ticked
- **THEN** there is one row for every occurrence of that weekday in the range, a week apart, in chronological order

#### Scenario: More than one weekday is ticked

- **WHEN** a table is generated for a range with several weekdays ticked
- **THEN** every occurrence of each of them is written, and the rows are in date order rather than grouped by weekday

#### Scenario: The range begins or ends on a ticked weekday

- **WHEN** the start date or the end date itself falls on a ticked weekday
- **THEN** that date has a row

#### Scenario: A holiday falls inside the range

- **WHEN** a ticked weekday falls on a school holiday inside the range
- **THEN** its row is written like any other, and the table has no gap

### Requirement: A span that describes no lessons writes no table

Where the end date falls before the start date, or where no weekday was ticked, there are no rows to write, and the command SHALL NOT write a table. A heading row over nothing is not a semester table; it is a thing to delete before the dialog can be answered properly.

#### Scenario: The end date is before the start date

- **WHEN** a table is generated from a dialog whose end date falls before its start date
- **THEN** no table is written into the document

#### Scenario: No weekday is ticked

- **WHEN** a table is generated from the dialog with no weekday ticked
- **THEN** no table is written into the document

#### Scenario: The range holds no occurrence of a ticked weekday

- **WHEN** a table is generated for a range too short to contain any ticked weekday
- **THEN** no table is written into the document
