# browser-verification Specification

## Purpose

Defines how a change to SafeLearn is verified in a real browser: how the application under test is brought up, how a verification run authenticates as a chosen role against the public demo realm, and what guarantees the harness gives its callers — reproducible runs, honest failures, and no credentials of real users or of this deployment anywhere in the repository.

## Requirements

### Requirement: A verification run yields an authenticated browser page

The harness SHALL hand a caller a browser page that has completed the Keycloak login and is displaying authenticated application content, for a role the caller names. Reaching the login form, an error page, or an unauthenticated redirect SHALL NOT be reported as success.

#### Scenario: Session requested for a known role

- **WHEN** a verification run asks the harness for a session as `student` or as `teacher`
- **THEN** the returned page has passed through the OIDC flow and is showing application content
- **AND** the session carries the roles of that account, so role-dependent content can be asserted on

#### Scenario: Login does not complete

- **WHEN** the credentials are rejected, the login form does not appear, or the flow ends anywhere other than authenticated application content
- **THEN** the harness fails the run with a message naming the role and the URL the flow stopped at
- **AND** it does not return a page that a caller could mistake for a logged-in one

#### Scenario: Two roles in one run

- **WHEN** a run obtains a `student` session and a `teacher` session
- **THEN** neither session sees the other's cookies, storage or preferences
- **AND** the order in which they are obtained does not change what either one sees

### Requirement: The application under test is the local working tree

Verification SHALL exercise the code in the working directory, so that a change being made is the change being verified. The harness SHALL ensure the application is reachable before it drives a browser at it, and SHALL NOT silently fall back to a deployed instance.

#### Scenario: No server is running

- **WHEN** a verification run starts and nothing is listening on the configured application port
- **THEN** the harness starts the application from the working tree
- **AND** waits until it answers requests before opening a browser
- **AND** stops that application again when the run ends, whether the run passed or failed

#### Scenario: A server is already running

- **WHEN** a verification run starts and the configured application port is already serving SafeLearn
- **THEN** the harness uses that instance instead of starting a second one
- **AND** leaves it running when the run ends

#### Scenario: The application never becomes reachable

- **WHEN** the application does not answer within the harness's startup timeout
- **THEN** the run fails with the application's own startup output included in the failure
- **AND** no browser is opened

### Requirement: Authentication uses only public demo credentials

The harness SHALL authenticate exclusively against the publicly documented demo accounts of the demo realm, and SHALL NOT read, store or transmit the data of any real user. No credential introduced by this capability SHALL be committed to the repository.

#### Scenario: Default configuration

- **WHEN** the harness runs without any environment configuration
- **THEN** it authenticates against the demo realm with the demo accounts documented in `README.md`
- **AND** those accounts are the only ones it will use by default

#### Scenario: Pointing the harness elsewhere

- **WHEN** an operator supplies a different identity provider, realm, account or password through environment variables
- **THEN** the harness uses those values without any file in the repository being edited

#### Scenario: Credentials in version control

- **WHEN** the change is complete
- **THEN** no client secret, password or account name introduced by this capability exists in a tracked file other than the demo values already published in `README.md`
- **AND** anything the harness writes while running is excluded from version control

### Requirement: A verification run is repeatable and self-contained

Running the verification twice in a row SHALL produce the same result, and a run SHALL NOT leave behind state that changes the outcome of the next one. This includes preferences the application stores server-side per user.

#### Scenario: Consecutive runs

- **WHEN** the verification is run twice with no change to the working tree in between
- **THEN** both runs report the same result

#### Scenario: Browser state between runs

- **WHEN** a run ends, by success, failure or interruption
- **THEN** its browser profile, cookies and any downloaded files are gone or ignored by the next run

#### Scenario: A run is interrupted

- **WHEN** a run is aborted before it finishes
- **THEN** no browser process and no application process started by that run stays alive

### Requirement: Verification is a single documented command

A developer or an assistant SHALL be able to run the verification with one command from the project root, without prior knowledge of the harness, and SHALL be able to watch it run when diagnosing a failure.

#### Scenario: Running the verification

- **WHEN** someone runs the project's documented test command after installing dependencies
- **THEN** the verification executes and reports, per check, whether it passed or failed
- **AND** the process exit code is non-zero if any check failed

#### Scenario: Watching a failure

- **WHEN** someone needs to see what the browser is doing
- **THEN** a documented switch runs the same verification with a visible browser window
- **AND** the checks performed are otherwise identical

#### Scenario: Documentation

- **WHEN** someone reads the project documentation
- **THEN** they find how to install the harness, how to run it, which accounts it uses, and what to configure if the identity provider is not the demo one

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

### Requirement: The harness reports the hosts a rendered page contacts

A caller SHALL be able to ask the harness which hosts a page reached out to while rendering, so a check can assert that a view is self-contained. The answer SHALL be taken from what the browser actually requested, not from what the page's markup names: a stylesheet can pull a further host in through an `@import` or a `url()` without any element on the page mentioning it, and a check reading markup alone would report such a page as clean.

#### Scenario: Reading the hosts a page contacted

- **WHEN** a caller loads a page through the harness and asks which hosts it contacted
- **THEN** it receives every host the browser issued a request to while rendering that page, each with the address that caused it
- **AND** requests a loaded stylesheet issued are included, not only those written as an element's `href` or `src`

#### Scenario: A page that reaches a third party

- **WHEN** a rendered page causes a request to a host other than the application under test
- **THEN** that host appears in the answer whether the request succeeded, failed or was refused
- **AND** a check can therefore fail on it without depending on the third party being reachable

#### Scenario: The identity provider

- **WHEN** a caller asks which hosts a page contacted
- **THEN** the identity provider is distinguishable from other external hosts, since authentication legitimately leaves the deployment while content must not

### Requirement: A run does not multiply authentications

Every login is a real round-trip against a public identity provider shared with other users. The number of logins a run performs SHALL follow from the roles the checks need, not from how the checks are distributed across files.

#### Scenario: A suite of several check files

- **WHEN** the verification runs a suite spread over several files
- **THEN** the number of logins stays proportional to the roles the checks need
- **AND** splitting existing checks into more files does not increase it

#### Scenario: Reporting the cost

- **WHEN** a run finishes
- **THEN** how long it took is visible in its output, so a change that makes it slower is noticed
