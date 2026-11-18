## MODIFIED Requirements

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

#### Scenario: The check navigates to a page the client script fills

- **WHEN** a check navigates to a page whose content the client script fetches, renders or reveals after the document has loaded, and then reads or acts on that content
- **THEN** it waits until the content it reads or acts on is present and shown before it reads or acts
- **AND** a page that never gets there fails the check with a message naming the path and what was missing, not with the timeout of a later click

#### Scenario: Consecutive runs of the exam checks

- **WHEN** the exam browser checks are run several times in a row with no change to the working tree
- **THEN** every run is green without a repeated test

#### Scenario: A new check clicks directly

- **WHEN** a browser check clicks through the page's direct click call instead of the harness's waiting action
- **THEN** the test suite fails and names the file and line

## ADDED Requirements

### Requirement: A failing browser check leaves evidence

When a browser check fails, the run SHALL keep enough of the browser's state at the moment of failure to tell whether the page was wrong or the check was early, without reproducing the failure. The evidence SHALL stay on the machine that ran the check and SHALL NOT enter version control.

#### Scenario: A browser check fails

- **WHEN** a check that drives a browser page fails, by a failed assertion, a timeout or an error
- **THEN** the run keeps, per open session of that check, the page's URL, a screenshot, the page's document and the console errors the page logged
- **AND** the failure output names the check and where its evidence lies

#### Scenario: A check passes

- **WHEN** a check passes
- **THEN** no evidence is kept for it
- **AND** a run that passes completely leaves no evidence behind

#### Scenario: Evidence and version control

- **WHEN** a run has kept evidence
- **THEN** that evidence lies in a location the repository ignores
- **AND** the next run replaces the evidence of the previous one, so what lies there belongs to the last run

#### Scenario: Evidence contains only demo data

- **WHEN** evidence is kept
- **THEN** it contains only what the demo accounts and the run's own records show, and no token or password

### Requirement: A group of browser checks runs on its own

Every group of checks in a browser test file SHALL set up or look up what it depends on itself, so that it reaches the same verdict whether it runs after the groups before it or alone. Re-running a single red check by its name SHALL therefore run that check, not cancel it.

#### Scenario: Running one check by name

- **WHEN** someone runs a browser test file with a name filter that matches a single check
- **THEN** the setup of that check's group completes and the check runs
- **AND** the check reaches the same verdict as in a run of the whole file

#### Scenario: Running one group

- **WHEN** a group of checks of `test/exam.test.js` runs without the groups before it
- **THEN** it passes exactly when it passes within the whole file

#### Scenario: A group needs records of another group

- **WHEN** a group depends on a record, such as a class, a course or a question, that another group creates
- **THEN** it creates or finds that record in its own setup instead of assuming the other group ran
