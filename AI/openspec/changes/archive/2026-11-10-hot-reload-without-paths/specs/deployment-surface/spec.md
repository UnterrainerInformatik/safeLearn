## MODIFIED Requirements

### Requirement: The unauthenticated reload endpoint survives malformed input

The endpoint a rendered page subscribes to for reload notifications is reachable without authentication by design. It carries no content and no file paths, only the kind of reload to perform. Because it is the one endpoint that answers before any authentication has happened, it SHALL treat everything a client sends it as hostile. A parameter it cannot interpret SHALL be handled as an absent one: the subscription SHALL be established, and the handler SHALL NOT raise. A client SHALL NOT be able to provoke an error inside the application by the shape of what it sends.

#### Scenario: A subscription carrying an uninterpretable parameter

- **WHEN** any client, authenticated or not, subscribes to the reload endpoint with a context parameter that cannot be interpreted
- **THEN** the subscription is established exactly as it would be without the parameter
- **AND** the client receives the reload notifications it would otherwise receive, decided as though no context had been given
- **AND** no error is raised inside the application

#### Scenario: A subscription without the parameter

- **WHEN** a client subscribes without a context parameter at all
- **THEN** the subscription is established, unchanged by this requirement

## ADDED Requirements

### Requirement: The reload endpoint names no file

A reload notification SHALL state only its kind: a reload of the navigation, or a reload of the page the client has open. It SHALL NOT contain the path of any corpus file, whether that file is open or restricted, and whether or not it is the one the client has open. The server SHALL decide which clients receive a page notification. A client SHALL receive one only when the file it declares as open is exactly one of the modified files. A declared file that merely contains, or ends with, a modified file's path SHALL NOT match. A page SHALL reload on every page notification it receives, except while a test is being written on it (`online-test`).

Known limit: a client can declare any path as open, so an unauthenticated client that guesses an exact path still learns when that file is modified. This requirement does not close that gap; doing so would need an authenticated stream that checks visibility per session.

#### Scenario: Several files modified in one sync

- **WHEN** the corpus is rescanned and both an open file and a file restricted to teachers are reported as modified
- **AND** an unauthenticated client has subscribed declaring the open file
- **THEN** that client receives a page notification
- **AND** the notification contains neither file's path

#### Scenario: A client whose file was not modified

- **WHEN** the corpus is rescanned and only files other than the declared one are reported as modified
- **THEN** that client receives no notification

#### Scenario: A declared context made of several paths

- **WHEN** a client declares as its open file a string that contains the paths of several corpus files
- **AND** one of those files is modified
- **THEN** that client receives no notification

#### Scenario: A page that is open when its file changes

- **WHEN** a reader has a page open and its file is modified and rescanned
- **THEN** the page reloads and returns to the position it was at, as before
