## MODIFIED Requirements

### Requirement: The table is written in the shape the corpus already uses

The table SHALL carry, in this order: a marker column whose heading is empty, a column of weekdays where more than one weekday was ticked, a column of dates, the subject columns as they were given, and an `Info` column. It SHALL be a table the renderer reads as one — a heading row, a delimiter row beneath it, and one row per lesson.

Where exactly one weekday was ticked, the weekday column SHALL be left out. Every row would carry the same three letters, and a column of one value costs width in a table that is already wide while saying nothing the date beside it does not. Whether the column is written SHALL follow from what was ticked and not from which weekdays the range happens to contain, so that it is answered by the dialog rather than by the end date: a table for Mondays and Thursdays keeps its weekday column even over a span short enough to hold only a Monday.

The headings the command supplies itself SHALL read `Day`, `Date` and `Info`, and dates SHALL be written as `dd.MM.yyyy`. The semester files in the corpus are already written this way, and a command that generated a second spelling would make the corpus disagree with itself over which one is the format.

A subject column SHALL be asked for as the two halves the headings in the corpus are made of — the subject, and who takes it — and the two SHALL be written as one heading with a line break between them (`0WMC<br>(UNTEG)`). That line break is markup, and a dialog that expected a person to type it would be asking them to know the format the dialog exists to spare them. Where only one half is given, the heading SHALL be that half alone: a line break written above nothing leaves a heading sitting high in its row, and somebody who filled in one field meant one line.

The half naming who takes the subject SHALL be written in parentheses — `UNTEG` written as `(UNTEG)` — and a half that already carries them SHALL be written as it stands rather than bracketed a second time. The parentheses are part of the form every heading in the corpus has, exactly as the line break is, and a dialog that asked a person to type them would be asking them for the format it exists to spare them.

Each half SHALL otherwise be written exactly as it was given. What belongs in a heading beyond its two halves is the author's to decide; a command that reformatted it would be deciding it instead.

#### Scenario: A table is generated

- **WHEN** the dialog is generated from with more than one weekday ticked
- **THEN** a table is written whose columns are, in order, the marker column with an empty heading, `Day`, `Date`, each subject column given, and `Info`

#### Scenario: The class meets on one weekday

- **WHEN** the dialog is generated from with exactly one weekday ticked
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

- **WHEN** the dialog is generated from with no subject column named
- **THEN** a well-formed table is still written, carrying the marker column, `Date` and `Info`, and `Day` where more than one weekday was ticked
