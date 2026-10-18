## ADDED Requirements

### Requirement: The Exams page hides the student's results while they write

On the student's Exams page (`/exam/my`), the results section, both its heading and its list, SHALL NOT be shown while the student's own attempt is running. This SHALL apply whether the attempt was started on the page or resumed when the page was opened or reloaded. Once the attempt has been submitted, by the student or by the server at the deadline, the page SHALL show the results section again, without a reload. The section SHALL then include the result of the attempt just submitted. The page SHALL show the results whenever no attempt of the student is running. A content page that places a test element and a results element SHALL show both as placed. A teacher's preview of a test SHALL NOT hide anything.

#### Scenario: Starting a test

- **WHEN** a student on `/exam/my` starts an open test
- **THEN** the writing view is shown and the page shows neither the results heading nor the results list

#### Scenario: Reloading during the test

- **WHEN** a student reloads `/exam/my` while their attempt is running
- **THEN** the attempt is resumed and the results are not shown

#### Scenario: Submitting

- **WHEN** the student submits the attempt
- **THEN** the page shows their points and grade, and below them the results again, including this test's result

#### Scenario: Time is up

- **WHEN** the deadline passes while the student's page is open and the server submits the attempt
- **THEN** the page shows the result and the results section again

#### Scenario: No test running

- **WHEN** a student opens `/exam/my` without a running attempt
- **THEN** the open tests and the results are both shown, as before

#### Scenario: A content page with both elements

- **WHEN** a student writes a test from a content page that also places a results element
- **THEN** that results element stays visible
