## ADDED Requirements

### Requirement: A browser check does not depend on the rendering timing of the page

A browser check SHALL reach the same verdict whether the page it drives renders quickly or slowly. An action on an element SHALL wait until the element is attached, visible and no longer moving, and SHALL be retried when the element is replaced before the action lands. An assertion on a state the page reaches asynchronously SHALL wait, within a bounded timeout, for that state before it is judged. A red check is therefore evidence against the working tree, not a reason to re-run.

#### Scenario: The page redraws the element right after loading

- **WHEN** a check clicks an element that the client script replaces or moves shortly after the page has loaded
- **THEN** the click lands on the element as it is after the redraw
- **AND** the check does not fail with an element that is detached, not clickable or not an element

#### Scenario: The asserted state arrives late

- **WHEN** a check asserts a state the page reaches only after a request, a toggle or a layout pass
- **THEN** the check waits for that state up to its timeout and passes once it is reached
- **AND** if the state is never reached, the check fails with a message naming the expected and the last observed state

#### Scenario: The element never becomes actionable

- **WHEN** the element a check acts on never appears, never becomes visible or never stops moving
- **THEN** the check fails within a bounded time with a message naming the element
- **AND** it does not wait for the whole suite's timeout

#### Scenario: Consecutive runs of the exam checks

- **WHEN** the exam browser checks are run several times in a row with no change to the working tree
- **THEN** every run is green without a repeated test

#### Scenario: A new check clicks directly

- **WHEN** a browser check clicks through the page's direct click call instead of the harness's waiting action
- **THEN** the test suite fails and names the file and line
