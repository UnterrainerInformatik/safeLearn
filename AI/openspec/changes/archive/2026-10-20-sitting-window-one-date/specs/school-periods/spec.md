## MODIFIED Requirements

### Requirement: Exact clock times remain available

The clock-time fields of the sitting form SHALL be one date and two times: the date the sitting is written on, the time it opens and the time it closes, in Vienna time. The window SHALL open and close on that date; a window across midnight SHALL NOT be offered by the form. Without periods configured, the sitting form SHALL use these fields. With periods configured, the sitting form SHALL offer a button that switches between periods and the clock-time fields, and back. Changing a sitting whose window does not lie on period boundaries SHALL open the form with the clock-time fields. Switching SHALL carry the window over when it lies on period boundaries, and SHALL otherwise keep the date and propose the default periods.

#### Scenario: An older sitting

- **WHEN** a teacher changes a sitting that opens at 10:05 and closes at 10:55
- **THEN** the form shows the clock-time fields with the sitting's date, 10:05 and 10:55

#### Scenario: Switching to exact times

- **WHEN** a teacher has chosen 2026-10-20, periods 3 to 4, and switches to exact times
- **THEN** the clock-time fields show the date 2026-10-20, 10:00 and 11:45

#### Scenario: One date

- **WHEN** a teacher schedules a sitting in clock times for 2026-10-20 from 10:05 to 10:55
- **THEN** the form asks for the date once, and the sitting opens at 2026-10-20 10:05 and closes at 2026-10-20 10:55, Vienna time

#### Scenario: An unreadable time

- **WHEN** a teacher types "10.5x" as the closing time
- **THEN** the field is marked invalid and the form does not submit
