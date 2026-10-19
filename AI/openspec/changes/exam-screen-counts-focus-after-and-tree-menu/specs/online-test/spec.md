## MODIFIED Requirements

### Requirement: A course lists its tests

Each course SHALL have a list of its tests, reachable from the module bar, showing per test its name, number of questions, its sittings with their windows and their state (scheduled, open, over), and how many participants have submitted. From the list a teacher SHALL open a test's sittings, the live view of any sitting in every state (scheduled, open and over), and the questions of its snapshot. The view for the class SHALL be linked only for a sitting that is not over. A student SHALL NOT reach the list.

#### Scenario: The course's tests

- **WHEN** a teacher opens the online tests of `WMC 4BHIF 2026/27`
- **THEN** every test of that course is listed with its sittings and the count of submitted attempts, and no test of another course appears

#### Scenario: A sitting that is over

- **WHEN** a teacher opens the online tests of a course whose test's only sitting ended yesterday
- **THEN** that sitting links its live view, and does not link the view for the class

### Requirement: Leaving the page is recorded and shown, never penalized automatically

While an attempt is open, the page SHALL report to the server each time it loses visibility or focus and when it regains it. The server SHALL keep, per attempt, the number of times and the total time away. These SHALL be shown to teachers, during the sitting and after it is over, and SHALL NOT change the grade. A total time away below one minute SHALL be shown in seconds; from one minute on it SHALL be shown in minutes and seconds.

#### Scenario: Switching to another tab

- **WHEN** a student switches to another tab three times for 47 seconds in total
- **THEN** the live view shows "left 3×, 47 s" for that student and their grade is unaffected

#### Scenario: Away for minutes

- **WHEN** a student left the page twice for 252 seconds in total
- **THEN** the live view shows "left 2×, 4 min 12 s" for that student

#### Scenario: After the sitting

- **WHEN** a sitting is over and a teacher opens its live view from the test's page
- **THEN** every participant is shown with their final status, the share of their attempt in focus, and how often and how long they left the page

## ADDED Requirements

### Requirement: The view for the class keeps its counts current

The view for the class SHALL show how many participants are writing, have submitted and have not started, and SHALL bring those counts up to date within a few seconds of a change, without a reload, for as long as the page stays open. It SHALL show no participant's name and offer nothing to click. When the session no longer acts as a teacher, it SHALL stop updating and say so.

#### Scenario: A student starts while the board shows the sitting

- **WHEN** the view for the class shows "0 writing · 0 submitted · 2 not started" and a participant starts their attempt
- **THEN** within a few seconds it shows "1 writing · 0 submitted · 1 not started", without the page being reloaded

#### Scenario: A student submits

- **WHEN** a participant who is writing submits while the view for the class is open
- **THEN** within a few seconds that participant is counted as submitted and no longer as writing

#### Scenario: Open for a whole lesson

- **WHEN** the view for the class has been open for longer than the teacher's access token lives and then a participant submits
- **THEN** the view counts that participant as submitted within a few seconds
