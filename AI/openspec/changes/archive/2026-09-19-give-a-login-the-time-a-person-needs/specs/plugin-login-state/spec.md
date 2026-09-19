## ADDED Requirements

### Requirement: The course of a login is readable in the log when debug logging is on

Where the system offers a debug-logging setting, switching it on SHALL make the course of a login readable: a login being started, the deadline it was given and when that deadline falls, a login ending at its deadline, and a callback arriving together with which conclusion it reached — an identity obtained, a login belonging to another window, or a login no longer in progress. A cause that a person is shown SHALL remain readable without the log, as "A failed login names what the plugin itself observed" requires; this requirement is about the particulars behind that cause, which no surface has room for. The value that ties a callback to the login that started it SHALL NOT appear in the log in full, since a log is read and passed on by hand while that login may still be in flight.

#### Scenario: A login is started with debug logging on

- **WHEN** a login is started while debug logging is on
- **THEN** the log carries that it was started, the deadline it was given, and when that deadline falls

#### Scenario: A callback arrives with debug logging on

- **WHEN** a callback arrives while debug logging is on
- **THEN** the log names which of the three conclusions it reached — an identity was obtained, it belongs to another window, or the login it names is no longer in progress

#### Scenario: A login ends at its deadline with debug logging on

- **WHEN** a login in progress reaches its deadline while debug logging is on
- **THEN** the log carries that it ended there, and how long it had been in progress

#### Scenario: The log is read by somebody other than the person who logged in

- **WHEN** any of the above is written to the log
- **THEN** the value tying a callback to its login is not there in full

## MODIFIED Requirements

### Requirement: A login in progress expires on its own

The system SHALL give a login in progress a bounded lifetime and SHALL end it when that lifetime passes, moving to *login failed* with a cause naming that no callback arrived. A login in progress SHALL NOT be retained beyond that point.

That lifetime SHALL be the system's own, fixed by the system and long enough for a person to complete a sign-in at the identity provider — a password, a second factor, and a moment of finding the device it is on. It SHALL NOT be taken from any lifetime an identity provider reports for a token or a session: those measure how long an identity is good for, or how much of a session is left, and neither is a measure of how long a person takes at a login page. No value the system stores between runs SHALL be able to shorten it.

#### Scenario: No callback arrives

- **WHEN** a login has been in progress past its lifetime and no callback has arrived
- **THEN** the state becomes *login failed*, the cause names that no callback arrived, and nothing is retained for that login

#### Scenario: A callback arrives after expiry

- **WHEN** a callback arrives for a login that has already expired
- **THEN** no identity is obtained from it and it is reported as belonging to a login that is no longer in progress

#### Scenario: A person takes their time at the login page

- **WHEN** a login has been started and the person is still at the identity provider's login page a minute later
- **THEN** the login is still in progress, and the state is still *logging in*

#### Scenario: The identity provider reports a short token or session lifetime

- **WHEN** the identity provider answers an exchange or a renewal with a token or session lifetime shorter than a sign-in takes, and a login is started afterwards
- **THEN** that login still gets the system's own lifetime, and what the identity provider reported has no bearing on it

#### Scenario: A short lifetime was stored by an earlier version

- **WHEN** the system starts holding a stored lifetime figure short enough to end a login before a person could conclude it
- **THEN** a login started afterwards still gets the system's own lifetime, and logging in needs nothing reset, reconfigured or edited by hand first
