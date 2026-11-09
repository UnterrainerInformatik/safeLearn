## MODIFIED Requirements

### Requirement: The harness puts preferences into a known state

The application reads per-user preferences from the identity provider, and the accounts a run uses are shared. A caller SHALL be able to set the preferences a check depends on and be sure the next page it reads was rendered with them. This SHALL hold whatever the session did before: a reset after a check that switched a teacher into student view SHALL take effect as reliably as the switch did, whether the test file runs alone or after the others.

#### Scenario: Setting preferences before a check

- **WHEN** a caller sets one or more preferences on a session
- **THEN** the harness writes the full preference block, so that setting one value does not discard the others
- **AND** the next page the session loads is rendered with those values in effect

#### Scenario: Leaving student view after a check

- **WHEN** a check sets `vt: 0` on the teacher session, fetches exam pages and API endpoints in student view, and then resets the preferences
- **THEN** the reset takes effect and the next check of the describe runs as a teacher
- **AND** this holds when `test/exam.test.js` runs alone as well as within `npm test`

#### Scenario: Confirming what was applied

- **WHEN** a preference write does not take effect
- **THEN** the harness fails with a message naming the preference, the value asked for and the value in effect
- **AND** the check does not proceed to assert on a page rendered with the wrong preference

#### Scenario: Preferences are not restored

- **WHEN** a session that changed preferences ends
- **THEN** the harness leaves the account's preferences as the run left them
- **AND** the next run does not depend on them, because it sets what it needs itself
