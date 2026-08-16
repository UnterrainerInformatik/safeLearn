## ADDED Requirements

### Requirement: The harness reports the session's effective roles

A caller SHALL be able to ask the harness which roles a session actually carries, so a check can derive what that session is allowed to see instead of hardcoding the group memberships of an account it does not own. Nothing beyond the role set and the account's identity SHALL leave the harness — tokens stay inside the browser.

#### Scenario: Reading the roles of a session

- **WHEN** a caller asks the harness for the roles of an open session
- **THEN** it receives the roles the application resolves for that session, including the ones derived from the directory and the account's own name
- **AND** the values are normalized the same way the application normalizes them, so a caller can compare them directly against a directive

#### Scenario: Tokens do not cross the boundary

- **WHEN** the harness reads the session's roles
- **THEN** no access token, refresh token or identity token is returned to the caller

### Requirement: The harness puts preferences into a known state

The application reads per-user preferences from the identity provider, and the accounts a run uses are shared. A caller SHALL be able to set the preferences a check depends on and be sure the next page it reads was rendered with them.

#### Scenario: Setting preferences before a check

- **WHEN** a caller sets one or more preferences on a session
- **THEN** the harness writes the full preference block, so that setting one value does not discard the others
- **AND** the next page the session loads is rendered with those values in effect

#### Scenario: Confirming what was applied

- **WHEN** a preference write does not take effect
- **THEN** the harness fails with a message naming the preference, the value asked for and the value in effect
- **AND** the check does not proceed to assert on a page rendered with the wrong preference

#### Scenario: Preferences are not restored

- **WHEN** a session that changed preferences ends
- **THEN** the harness leaves the account's preferences as the run left them
- **AND** the next run does not depend on them, because it sets what it needs itself

### Requirement: The harness fetches a rendered page by path and view

A content check works on rendered output, and the same source file is served in three views. A caller SHALL be able to ask for a named path in a named view and receive the rendered result without repeating navigation, view selection and the application's own reveal-on-init behavior in every check.

#### Scenario: Requesting a page in a view

- **WHEN** a caller asks for a corpus path as a page, as a presentation or as a document
- **THEN** the harness navigates to it and returns once the application has rendered it
- **AND** the caller can read both the text and the structure of the result

#### Scenario: The page does not render

- **WHEN** the requested path does not render — the application redirects away, or the content never appears
- **THEN** the harness fails with a message naming the path, the view and where the request ended up
- **AND** it does not return an empty result that a check could mistake for an empty page

### Requirement: A run does not multiply authentications

Every login is a real round-trip against a public identity provider shared with other users. The number of logins a run performs SHALL follow from the roles the checks need, not from how the checks are distributed across files.

#### Scenario: A suite of several check files

- **WHEN** the verification runs a suite spread over several files
- **THEN** the number of logins stays proportional to the roles the checks need
- **AND** splitting existing checks into more files does not increase it

#### Scenario: Reporting the cost

- **WHEN** a run finishes
- **THEN** how long it took is visible in its output, so a change that makes it slower is noticed
