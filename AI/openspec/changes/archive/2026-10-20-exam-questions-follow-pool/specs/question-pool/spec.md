## MODIFIED Requirements

### Requirement: A question shows where it has been used

For each question, the browser SHALL show the tests that hold it, whether planned or already written, with each test's course and date, and how many there are. A test's date SHALL be the day its first sitting opens, or the day the test was assembled while it has no sitting. This SHALL be visible while choosing questions for a new test. A test that no longer holds the question SHALL no longer be listed. A deleted question's usage SHALL go with it.

#### Scenario: A question used twice

- **WHEN** a question appeared in tests for `4AHIF` on 2026-11-10 and for `4BHIF` on 2026-11-12
- **THEN** the browser shows both uses with course and date

#### Scenario: Removed from a planned test

- **WHEN** a teacher takes a question out of a test whose sitting has not opened yet
- **THEN** the browser no longer lists that test among the question's uses
