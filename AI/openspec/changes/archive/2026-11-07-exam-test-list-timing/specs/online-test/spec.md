## MODIFIED Requirements

### Requirement: A course lists its tests

Each course SHALL have a list of its tests, reachable from the module bar, showing per test its name, number of questions, its sittings with their windows and their state (scheduled, open, over), and how many participants have submitted. From the list a teacher SHALL open a test's sittings, the live view of any sitting in every state (scheduled, open and over), and the questions of its snapshot. The view for the class SHALL be linked only for a sitting that is not over. A student SHALL NOT reach the list.

The tests SHALL be listed newest first. Tests without a sitting SHALL come first, the most recently created first. All other tests SHALL follow, ordered by the start of their first sitting, latest first. A make-up SHALL NOT move a test.

Each test's row SHALL be coloured by where the test stands:
- **open right now** while any of its sittings is open (an offline sitting once started), whatever its other sittings are;
- otherwise **done** once it has sittings and every one is over;
- otherwise **within the next 7 days** while a sitting that is not over opens less than seven days from now, including a planned offline sitting past its time that has not been started;
- otherwise **later, or no sitting yet**.

The colour SHALL NOT be the only carrier: each row SHALL name its state in words (as its tooltip), and a legend above the list SHALL show the four states with their colours. The marked row SHALL keep its own highlight over the colour, and the row's colour SHALL still be visible at its edge.

#### Scenario: The course's tests

- **WHEN** a teacher opens the online tests of `WMC 4BHIF 2026/27`
- **THEN** every test of that course is listed with its sittings and the count of submitted attempts, and no test of another course appears

#### Scenario: A sitting that is over

- **WHEN** a teacher opens the online tests of a course whose test's only sitting ended yesterday
- **THEN** that sitting links its live view, and does not link the view for the class
- **AND** the test's row is marked as done

#### Scenario: Newest first

- **WHEN** a course has a test without a sitting, a test whose first sitting was last week and a later make-up next month, and a test whose first sitting is tomorrow
- **THEN** the list shows the test without a sitting first, then the test of tomorrow, then the test of last week

#### Scenario: A test being written right now

- **WHEN** one of a test's sittings is open and a make-up is scheduled for next week
- **THEN** its row is marked as open right now, not as within the next 7 days

#### Scenario: The next test

- **WHEN** a test's only sitting opens in three days
- **THEN** its row is marked as within the next 7 days
- **AND** a test whose only sitting opens in ten days is marked as later
