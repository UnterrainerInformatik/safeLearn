## MODIFIED Requirements

### Requirement: A sitting is scheduled by date and periods

With periods configured, the form that schedules or changes a sitting of an online test SHALL ask for:

- a date;
- one period, offering every configured period;
- the minutes after the period's start at which the start window opens, a whole number from 0 up to, but not including, the period's length, defaulting to 5;
- the length of the start window in whole minutes, from 1 to 600, defaulting to 10;
- the duration of an attempt, as before.

The start window SHALL open at the chosen period's start plus the chosen minutes and SHALL close the chosen length later, on the chosen date in Vienna time. It SHALL close on that date; a start window across midnight SHALL NOT be offered. While the teacher chooses, the form SHALL show the resulting start window in clock times and the time at which the last attempt ends at the latest: the end of the start window plus the duration.

A new sitting SHALL default to today's date and to the first period of today whose default start window, from 5 to 15 minutes after the period's start, has not closed yet. When no such period of today is left, it SHALL default to the next day and its first period numbered 1 or higher, or its first period when there is none.

A planned offline sitting SHALL keep its own form (`offline-test`), a date and the planned time of its start, unchanged by this requirement.

#### Scenario: Lesson 4, five minutes in, for ten minutes

- **WHEN** periods include `4=10:55-11:45`, and a teacher schedules a sitting for 2026-10-20 in period 4, 5 minutes after its start, with a 10-minute start window and a 20-minute duration
- **THEN** the start window runs from 2026-10-20 11:00 to 11:10 Vienna time, and the form shows that the last attempt ends at 11:30 at the latest

#### Scenario: At the start of the period

- **WHEN** a teacher schedules a sitting in period 3 (10:00–10:50) with 0 minutes and a 15-minute start window
- **THEN** the start window runs from 10:00 to 10:15

#### Scenario: An offset beyond the period

- **WHEN** a teacher enters 50 minutes after the start of a 50-minute period
- **THEN** the field is marked invalid and the form does not submit

#### Scenario: Two periods

- **WHEN** a teacher schedules a sitting for 2026-10-20 in period 3 (10:00–10:50) with 0 minutes and a 60-minute start window
- **THEN** the start window runs from 2026-10-20 10:00 to 11:00, Vienna time, past the end of period 3

#### Scenario: Reversed range

- **WHEN** a teacher opens the form for a sitting of an online test
- **THEN** it offers one period choice and no to period, so no range of periods can be reversed

#### Scenario: Defaults during a lesson

- **WHEN** a teacher opens the form for a new sitting on 2026-10-19 at 10:20
- **THEN** the form proposes 2026-10-19, period 4, 5 minutes and a 10-minute start window, since the default start window of period 3 (10:05–10:15) has closed

#### Scenario: Defaults early in a lesson

- **WHEN** a teacher opens the form for a new sitting on 2026-10-19 at 10:08
- **THEN** the form proposes 2026-10-19, period 3, 5 minutes and a 10-minute start window, so the start window runs from 10:05 to 10:15

#### Scenario: Defaults in the evening

- **WHEN** a teacher opens the form for a new sitting on 2026-10-19 at 22:30
- **THEN** the form proposes 2026-10-20 and period 1

### Requirement: Exact clock times remain available

The clock-time fields of the form for a sitting of an online test SHALL be a date, the time the start window opens, and the length of the start window in whole minutes, from 1 to 600, in Vienna time. The start window SHALL open and close on that date; a start window across midnight SHALL NOT be offered by the form. Without periods configured, the sitting form SHALL use these fields. With periods configured, the sitting form SHALL offer a button that switches between periods and the clock-time fields, and back. Changing a sitting whose start window does not open within a period, or does not close on the date it opens, SHALL open the form with the clock-time fields. Switching SHALL carry the start window over when it opens within a period, and SHALL otherwise keep the date, the length and propose the default period with 5 minutes.

#### Scenario: An older sitting

- **WHEN** a teacher changes a sitting stored before this change, from 10:00 to 11:45 on 2026-10-20
- **THEN** the form shows period 3, 0 minutes and a 105-minute start window, and nothing about the sitting was converted

#### Scenario: A start window outside every period

- **WHEN** a teacher changes a sitting whose start window opens at 07:58, while the first period starts at 08:00
- **THEN** the form shows the clock-time fields with the sitting's date, 07:58 and the start window's length

#### Scenario: Switching to exact times

- **WHEN** a teacher has chosen 2026-10-20, period 4 (10:55–11:45), 5 minutes and a 10-minute start window, and switches to exact times
- **THEN** the clock-time fields show the date 2026-10-20, 11:00 and 10 minutes

#### Scenario: Switching back to periods

- **WHEN** the clock-time fields show 2026-10-20, 11:00 and 10 minutes, and the teacher switches to periods
- **THEN** the form shows period 4, 5 minutes and a 10-minute start window

#### Scenario: One date

- **WHEN** a teacher schedules a sitting in clock times for 2026-10-20 at 10:05 with a 10-minute start window
- **THEN** the form asks for the date once, and the start window runs from 2026-10-20 10:05 to 10:15, Vienna time

#### Scenario: An unreadable time

- **WHEN** a teacher types "10.5x" as the opening time
- **THEN** the field is marked invalid and the form does not submit

### Requirement: Windows on period boundaries are shown as periods

Every place in the UI that shows the start window of a sitting of an online test SHALL show its date, the word for the start and its clock times. With periods configured, a start window that opens within a period, from its start up to but not including its end, SHALL also name that period, between the date and the start. The weekday and date SHALL follow the user's chosen format and the words SHALL follow the user's chosen language (see `ui-language`, `locale-formats`), such as `Tue 20/10 · lesson 4 · start 11:00–11:10` in English with `en-GB` and `Di. 20.10. · 4. EH · Start 11:00–11:10` in German with `de-AT`. A start window that does not open within a period SHALL be shown without one, such as `Di. 20.10. · Start 07:58–08:08`. A start window that closes on another date than it opens SHALL be shown in full clock times with both dates. This SHALL hold at least in the list of tests, the sittings of a test, the teacher's live view and the view for the class.

The window of an offline sitting, which all its participants share, SHALL be shown as before: as its date and range of periods when it lies on period boundaries, and in clock times otherwise.

#### Scenario: A sitting in the list of tests

- **WHEN** the list of tests shows a sitting whose start window runs on 2026-10-20 from 11:00 to 11:10 to a teacher with English and `de-AT`
- **THEN** its window reads `Tue 20.10. · lesson 4 · start 11:00–11:10`

#### Scenario: The same sitting in German

- **WHEN** a teacher with German and `de-AT` sees that sitting
- **THEN** its window reads `Di. 20.10. · 4. EH · Start 11:00–11:10`

#### Scenario: A window off the periods

- **WHEN** the live view shows a sitting whose start window runs on 2026-10-20 from 07:58 to 08:08, and the first period starts at 08:00
- **THEN** its window reads `Di. 20.10. · Start 07:58–08:08` to a teacher with German and `de-AT`

#### Scenario: Without periods

- **WHEN** the live view shows that sitting on an instance without periods to a teacher with German and `de-AT`
- **THEN** its window reads `Di. 20.10. · Start 11:00–11:10`

#### Scenario: An offline sitting

- **WHEN** a started offline sitting runs from 10:00 to 11:45 on period boundaries
- **THEN** its window reads `Di. 20.10. · 3.–4. EH`, as before
