# school-periods Specification

## Purpose

Lets a deployment declare the school's teaching periods, so that teachers schedule a sitting as a date plus a range of periods and read every sitting window the same way, with the clock times a hover away.

## Requirements

### Requirement: The school's periods are deployment configuration

A deployment SHALL declare its periods in the environment variable `SCHOOL_PERIODS` as a comma-separated list of entries `<number>=<HH:MM>-<HH:MM>`, for example `1=08:00-08:50,2=08:55-09:45`. Each entry SHALL give its period's own start and end in Vienna local time; no period SHALL be derived from another. Numbers SHALL be non-negative integers and unique, every start SHALL lie before its end, and the entries, taken in ascending number, SHALL NOT overlap; a period MAY start at the minute the previous one ends. The periods SHALL apply to every class and every day of the instance.

When the exam module starts with `SCHOOL_PERIODS` set to a value that breaks any of these rules, the module SHALL NOT start and SHALL log a message naming the offending entry; as with every other module failure (`exam-foundation`), the instance SHALL keep serving as an instance with the module switched off. When the variable is unset or empty, the instance SHALL start without periods, and every form and display SHALL behave as it does without this capability.

#### Scenario: The school's list

- **WHEN** the module starts with `SCHOOL_PERIODS=0=07:05-07:55,1=08:00-08:50,…,11=17:20-18:05,12=18:05-18:50,…,16=21:25-22:10`
- **THEN** it starts, and period 12 is known as 18:05–18:50, directly after period 11

#### Scenario: Overlapping periods

- **WHEN** the module starts with `SCHOOL_PERIODS=1=08:00-08:50,2=08:45-09:35`
- **THEN** the module is disabled for this run, the reader keeps serving, and the log names period 2 as overlapping period 1

#### Scenario: Malformed entry

- **WHEN** the module starts with `SCHOOL_PERIODS=1=8-9`
- **THEN** the module is disabled for this run, the reader keeps serving, and the log names the entry `1=8-9`

#### Scenario: No periods configured

- **WHEN** the module starts without `SCHOOL_PERIODS`
- **THEN** sittings are scheduled with the clock-time fields and every window is shown in clock times, as before

### Requirement: The variable reaches the container

A deployment SHALL pass `SCHOOL_PERIODS` to the container through its environment, alongside `EXAM_MODULE`, not through a file baked into the image.

#### Scenario: Compose file

- **WHEN** a deployment is started from `deploy/docker-compose.yml` with `SCHOOL_PERIODS` set in its environment
- **THEN** the instance in the container sees the same value

### Requirement: A sitting is scheduled by date and periods

With periods configured, the form that schedules or changes a sitting of an online test SHALL ask for:

- a date;
- one period, offering every configured period;
- the minutes after the period's start at which the start window opens, a whole number from 0 up to, but not including, the period's length, defaulting to 5;
- the length of the start window in whole minutes, from 1 to 600, defaulting to 10;
- the duration of an attempt, as before.

The start window SHALL open at the chosen period's start plus the chosen minutes and SHALL close the chosen length later, on the chosen date in Vienna time. It SHALL close on that date; a start window across midnight SHALL NOT be offered. While the teacher chooses, the form SHALL show the resulting start window in clock times and the time at which the last attempt ends at the latest: the end of the start window plus the duration.

A new sitting SHALL default to today's date and to the first period of today whose default start window, from 5 to 15 minutes after the period's start, has not closed yet. When no such period of today is left, it SHALL default to the next day and its first period numbered 1 or higher, or its first period when there is none.

A sitting of an offline test SHALL be planned by its own form (see "An offline sitting is planned by date, start lesson and end lesson").

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

The window of a started offline sitting, which all its participants share, SHALL be shown as before: as its date and range of periods when it lies on period boundaries, and in clock times otherwise. A planned offline sitting, not yet started, SHALL be shown with its date, with its start lesson and end lesson when its plan matches them as the form reads it (see "An offline sitting is planned by date, start lesson and end lesson"), with the word for planned and its planned clock times, and with its duration, such as `Mo. 30.11. · 4.–6. EH · geplant 10:55–13:35 · 160 Min` in German and `Mon 30/11 · lessons 4–6 · planned 10:55–13:35 · 160 min` in English with `en-GB`. A plan that does not match a lesson SHALL be shown without one, such as `Mo. 30.11. · geplant 07:58–08:48 · 50 Min`.

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

#### Scenario: A planned long test

- **WHEN** a teacher with German and `de-AT` sees an offline sitting planned on 2026-11-30 from 10:55 with 160 minutes, and lessons 4 to 6 run from 10:55 to 13:35
- **THEN** it reads `Mo. 30.11. · 4.–6. EH · geplant 10:55–13:35 · 160 Min`

#### Scenario: A planned short test

- **WHEN** an offline sitting is planned on 2026-11-30 from 09:00 with 20 minutes, within lesson 2 (08:55–09:45)
- **THEN** it reads `Mo. 30.11. · 2. EH · geplant 09:00–09:20 · 20 Min` to a teacher with German and `de-AT`

### Requirement: Hovering a period shows its clock times

Wherever the UI shows a period or a range of periods, including the period choices of the sitting form, it SHALL carry the clock times as a tooltip: the period's start and end for one period, the from period's start and the to period's end for a range, such as `10:00–11:45`.

#### Scenario: Hovering a window

- **WHEN** a teacher hovers `lessons 3–4` in the sittings of a test
- **THEN** the tooltip reads `10:00–11:45`

#### Scenario: Hovering a choice

- **WHEN** a teacher hovers period 12 in the to-period choice
- **THEN** the tooltip reads `18:05–18:50`

### Requirement: An offline sitting is planned by date, start lesson and end lesson

With periods configured, the form that plans or changes a sitting of an offline test, a make-up included, SHALL ask for:

- a date;
- a start lesson, offering every configured period;
- the minutes after the start lesson's start at which the sitting is planned to begin, a whole number from 0 up to, but not including, the start lesson's length, defaulting to 0;
- an end lesson, offering every configured period from the start lesson on;
- the duration in whole minutes, from 1 to 600.

The planned start SHALL be the start lesson's start plus the minutes, on the chosen date in Vienna time. The minutes SHALL NOT move the end: whenever the teacher changes the start lesson, the minutes or the end lesson, the form SHALL set the duration to the end lesson's end minus the planned start and show it in the duration field. Choosing a start lesson after the end lesson SHALL move the end lesson to the start lesson. Changing the date SHALL leave the duration as it is. The teacher SHALL be able to type another duration afterwards; the form SHALL then keep it until a lesson or the minutes change again. A planned end after midnight SHALL NOT be offered. While the teacher chooses, the form SHALL show the planned start and end in clock times.

A new first sitting SHALL default to today and the lesson running now or else the next one starting today; once no lesson of today is left, to the next day and its first lesson numbered 1 or higher, or its first lesson when there is none; and to 0 minutes, to the same lesson as end lesson, and to the test's duration. A new make-up SHALL default the same way, with the duration of the test's first sitting. The duration SHALL be recomputed only when the teacher changes a lesson or the minutes.

When the form opens on a planned sitting, it SHALL show the lessons and minutes when the plan matches them: the start lies within a lesson, from its start up to but not including its end, on the date of the plan, and the planned end is the end of that lesson or a later one, or lies within the start lesson. The end lesson SHALL be the one whose end the plan ends at, or the start lesson when the plan ends within it. Any other plan SHALL open with the clock-time fields.

The form for a sitting of an online test SHALL NOT change by this requirement.

#### Scenario: A long test over lessons 4 to 6

- **WHEN** periods include `4=10:55-11:45`, `5=11:50-12:40` and `6=12:45-13:35`, and a teacher chooses 2026-11-30, start lesson 4, 0 minutes and end lesson 6
- **THEN** the duration field shows 160, and the form shows the plan from 10:55 to 13:35

#### Scenario: Starting five minutes in does not extend the end

- **WHEN** in that form the teacher changes the minutes to 5
- **THEN** the duration field shows 155, and the plan runs from 11:00 to 13:35

#### Scenario: A short test in one lesson

- **WHEN** a teacher plans a sitting of a 20-minute short test on 2026-11-30, start lesson 2 (08:55–09:45), and changes the minutes to 5
- **THEN** the duration field shows 45, and after the teacher types 20 into it, the plan runs from 09:00 to 09:20

#### Scenario: Proposed duration

- **WHEN** a teacher opens the form for the first sitting of a test with a duration of 20 minutes
- **THEN** the form proposes start lesson and end lesson the same, 0 minutes and 20 minutes, until the teacher changes a lesson or the minutes

#### Scenario: Start lesson after the end lesson

- **WHEN** the form shows start lesson 3 and end lesson 4, and the teacher chooses start lesson 5
- **THEN** the end lesson becomes 5, and the duration is the minutes from the planned start to the end of lesson 5

#### Scenario: Minutes beyond the lesson

- **WHEN** a teacher enters 50 minutes after the start of a 50-minute lesson
- **THEN** the field is marked invalid and the form does not submit

#### Scenario: Opening a plan that matches lessons

- **WHEN** a teacher changes a sitting planned on 2026-11-30 from 11:00 with 155 minutes, and lessons 4 to 6 run from 10:55 to 13:35
- **THEN** the form shows start lesson 4, 5 minutes, end lesson 6 and 155 minutes

#### Scenario: Opening a plan that matches no lesson

- **WHEN** a teacher changes a sitting planned from 07:58, while the first lesson starts at 08:00
- **THEN** the form shows the clock-time fields with the plan's date, 07:58, its end and its duration

### Requirement: An offline sitting can be planned by clock times

The clock-time fields of the form for a sitting of an offline test SHALL be a date, the planned start, the planned end, and the duration in whole minutes from 1 to 600, in Vienna time. Start and end SHALL lie on that date; an end after midnight SHALL NOT be offered, and an end not after the start SHALL mark the end invalid so the form does not submit. Changing the start or the end SHALL set the duration to the minutes between them; changing the start SHALL keep the end. Typing a duration SHALL move the end to the start plus the duration. Without periods configured, the form SHALL use these fields. With periods configured, it SHALL offer a button that switches between lessons and clock times, and back. Switching to clock times SHALL carry the plan over. Switching to lessons SHALL carry the plan over when it matches lessons as above, and SHALL otherwise keep the date and the duration and propose the lesson a new sitting would, with 0 minutes and the same lesson as end lesson.

#### Scenario: Start and end by clock time

- **WHEN** a teacher plans an offline sitting in clock times on 2026-11-30 from 11:00 to 13:35
- **THEN** the duration field shows 155, and the plan is stored with 11:00 and 155 minutes

#### Scenario: A later start keeps the end

- **WHEN** in that form the teacher changes the start to 11:10
- **THEN** the end stays 13:35, and the duration field shows 145

#### Scenario: Typing a duration

- **WHEN** in that form the teacher types 100 into the duration
- **THEN** the end becomes 12:50

#### Scenario: Switching from lessons

- **WHEN** a teacher has chosen 2026-11-30, start lesson 4 (10:55–11:45), 5 minutes and end lesson 6 (ending 13:35), and switches to exact times
- **THEN** the clock-time fields show 2026-11-30, 11:00, 13:35 and 155 minutes

#### Scenario: An end before the start

- **WHEN** a teacher enters 11:00 as start and 10:30 as end
- **THEN** the end is marked invalid and the form does not submit

#### Scenario: Without periods

- **WHEN** a teacher plans an offline sitting on an instance without periods
- **THEN** the form shows the date, the start, the end and the duration, and no switch to lessons
