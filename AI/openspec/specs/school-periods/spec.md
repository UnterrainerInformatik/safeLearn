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

With periods configured, the form that schedules or changes a sitting SHALL ask for a date, a from period and a to period, and SHALL offer every configured period in both choices. The to period SHALL NOT lie before the from period. A new sitting SHALL default to today's date and to the period running now, or else the next period starting today, as both from and to period; when no period of today is left, it SHALL default to the next day and its first period numbered 1 or higher, or its first period when there is none. The sitting's window SHALL open at the start of the from period and close at the end of the to period, on the chosen date in Vienna time. The form SHALL show the resulting clock times while the teacher chooses.

What the form sends, how a sitting is stored, and every rule a sitting is checked against SHALL stay as they are without periods.

#### Scenario: Two periods

- **WHEN** a teacher schedules a sitting for 2026-10-20, from period 3 to period 4
- **THEN** the sitting opens at 2026-10-20 10:00 and closes at 2026-10-20 11:45, Vienna time

#### Scenario: Defaults during a lesson

- **WHEN** a teacher opens the form for a new sitting on 2026-10-19 at 10:20
- **THEN** the form proposes 2026-10-19, from period 3 to period 3

#### Scenario: Defaults in the evening

- **WHEN** a teacher opens the form for a new sitting on 2026-10-19 at 22:30
- **THEN** the form proposes 2026-10-20, from period 1 to period 1

#### Scenario: Reversed range

- **WHEN** a teacher chooses period 5 as from period
- **THEN** the to period offers only periods from 5 on, and a to period before 5 is moved to 5

### Requirement: Exact clock times remain available

With periods configured, the sitting form SHALL offer a button that switches between periods and the clock-time fields for opening and closing, and back. Changing a sitting whose window does not lie on period boundaries SHALL open the form with the clock-time fields. Switching SHALL carry the window over when it lies on period boundaries, and SHALL otherwise keep the date and propose the default periods.

#### Scenario: An older sitting

- **WHEN** a teacher changes a sitting that opens at 10:05 and closes at 10:55
- **THEN** the form shows the clock-time fields with 10:05 and 10:55

#### Scenario: Switching to exact times

- **WHEN** a teacher has chosen 2026-10-20, periods 3 to 4, and switches to exact times
- **THEN** the clock-time fields show 2026-10-20 10:00 and 2026-10-20 11:45

### Requirement: Windows on period boundaries are shown as periods

With periods configured, every place in the UI that shows a sitting's window SHALL show a window that opens at the start of one period and closes at the end of the same or a later period on the same date as the date and the period range. The weekday and date SHALL follow the user's chosen format and the words for one period and a range SHALL follow the user's chosen language (see `ui-language`, `locale-formats`), such as `Tue 20/10 · lessons 3–4` or `Tue 20/10 · lesson 3` in English with `en-GB`, and `Di. 20.10. · 3.–4. EH` or `Di. 20.10. · 3. EH` in German with `de-AT`. Any other window SHALL be shown in clock times as without periods. This SHALL hold at least in the list of tests, the sittings of a test, the teacher's live view and the class screen.

#### Scenario: A sitting in the list of tests

- **WHEN** the list of tests shows a sitting from 2026-10-20 10:00 to 11:45 to a teacher with English and `de-AT`
- **THEN** its window reads `Tue 20.10. · lessons 3–4`

#### Scenario: The same sitting in German

- **WHEN** a teacher with German and `de-AT` sees that sitting
- **THEN** its window reads `Di. 20.10. · 3.–4. EH`

#### Scenario: A window off the periods

- **WHEN** the live view shows a sitting from 2026-10-20 10:05 to 10:55
- **THEN** its window reads in clock times, as without periods

### Requirement: Hovering a period shows its clock times

Wherever the UI shows a period or a range of periods, including the period choices of the sitting form, it SHALL carry the clock times as a tooltip: the period's start and end for one period, the from period's start and the to period's end for a range, such as `10:00–11:45`.

#### Scenario: Hovering a window

- **WHEN** a teacher hovers `lessons 3–4` in the sittings of a test
- **THEN** the tooltip reads `10:00–11:45`

#### Scenario: Hovering a choice

- **WHEN** a teacher hovers period 12 in the to-period choice
- **THEN** the tooltip reads `18:05–18:50`
