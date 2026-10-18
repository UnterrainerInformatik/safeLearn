# locale-formats Specification

## Purpose

Formats every date, time and number the app shows by the reader's chosen format in the school's time zone, and lets dates and times be entered in that same format.

## Requirements

### Requirement: Dates, times and numbers follow the chosen format

Every date, time and number the app formats SHALL use the user's chosen format (see `ui-language`), never the browser's or the operating system's locale, and SHALL show times in the school's time zone (Europe/Vienna). Within one format, the same kind of value SHALL look the same on every page.

#### Scenario: de-AT

- **WHEN** a user with `de-AT` sees 2026-10-20, 10:00 and 1.5 points
- **THEN** they read `20.10.2026`, `10:00` and `1,5`

#### Scenario: en-GB

- **WHEN** a user with `en-GB` sees the same values
- **THEN** they read `20/10/2026`, `10:00` and `1.5`

#### Scenario: Browser in another language

- **WHEN** a user with `de-AT` uses a browser set to English (US)
- **THEN** dates still read `20.10.2026`

#### Scenario: Same kind of value, same look

- **WHEN** a user sees the import date of a question in the pool and a school year's start in the classes overview
- **THEN** both dates are written in the same form

### Requirement: Dates and times are entered in the chosen format

Wherever a date or a date with time is entered (gradebook columns, school year dates, sittings), the field SHALL show and accept the value in the chosen format, whatever the browser or operating system is set to. It SHALL offer a calendar to pick from, SHALL be usable by keyboard alone, and SHALL be announced by screen readers with its label and value. A typed value the format cannot read SHALL be marked as invalid at the field and SHALL NOT be saved. Limits a field has today (such as a column's date within the school year) SHALL still hold.

#### Scenario: Typing a date

- **WHEN** a teacher with `de-AT` types `20.10.2026` into a gradebook column's date
- **THEN** the column is saved with the date 2026-10-20

#### Scenario: Format independent of the system

- **WHEN** a teacher with `en-GB` opens the date of a school year on a computer set to German
- **THEN** the field shows `01/09/2026`

#### Scenario: Picking by keyboard

- **WHEN** a teacher opens the calendar of a date field with the keyboard and moves with the arrow keys
- **THEN** the focused day moves accordingly and Enter takes it into the field

#### Scenario: Unreadable input

- **WHEN** a teacher types `32.10.2026`
- **THEN** the field is marked invalid with a message beside it and nothing is saved

#### Scenario: Limits stay

- **WHEN** a teacher picks a column date outside the school year
- **THEN** the date is refused as it is today
