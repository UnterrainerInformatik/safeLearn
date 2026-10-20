## Purpose

Defines how SafeLearn runs without an identity provider — operating tier 1, pure publishing: how an instance opts into it, which roles its readers hold, where a reader's preferences and last visited page are kept, which surfaces are absent, and which combinations refuse to start.

## ADDED Requirements

### Requirement: Running without an identity provider is an explicit choice

An instance SHALL run without an identity provider only when its environment sets `AUTH=none`. With `AUTH=keycloak`, or with `AUTH` unset, it SHALL run with the identity provider as it does today. Running without an identity provider SHALL NOT be a fallback: an instance that does not set `AUTH=none` and cannot read its identity-provider configuration SHALL refuse to start, rather than start without one. A value of `AUTH` other than `none` or `keycloak`, compared case-insensitively and ignoring surrounding whitespace, SHALL refuse the start. A refused start SHALL terminate with a message that names `AUTH` and the values it accepts, and SHALL NOT begin serving requests.

#### Scenario: The mode is chosen

- **WHEN** an instance starts with `AUTH=none` and no `keycloak.json`
- **THEN** it starts, serves the corpus and contacts no identity provider

#### Scenario: The identity-provider configuration is missing by mistake

- **WHEN** an instance starts without `AUTH` and without a readable `keycloak.json`
- **THEN** it terminates with a message naming `AUTH=none` as the way to run without an identity provider
- **AND** it does not serve any page, public or restricted

#### Scenario: Capitalization and whitespace, and an unknown value

- **WHEN** an instance starts with `AUTH=None ` or `AUTH= KEYCLOAK`
- **THEN** it runs without, respectively with, the identity provider
- **AND** an instance started with `AUTH=off` terminates with a message naming the accepted values

#### Scenario: Both are present

- **WHEN** an instance starts with `AUTH=none` and a `keycloak.json` is present in its working directory
- **THEN** it runs without an identity provider and does not read the file

### Requirement: A switch that needs an identity refuses to start without one

An instance SHALL refuse to start when it is asked to run without an identity provider and, at the same time, a switch is on whose function depends on knowing who a reader is. `EXAM_MODULE=on` is such a switch. The refusal SHALL name both settings and SHALL NOT depend on whether the code base already contains the module the switch turns on.

#### Scenario: The exam module without an identity

- **WHEN** an instance starts with `AUTH=none` and `EXAM_MODULE=on`
- **THEN** it terminates with a message naming `AUTH` and `EXAM_MODULE`
- **AND** it does not begin serving requests

#### Scenario: The exam module with an identity

- **WHEN** an instance starts with the identity provider and `EXAM_MODULE=on`
- **THEN** this check does not prevent the start

### Requirement: Every reader holds the deployment's reader roles

Without an identity provider, every request SHALL be served as a reader holding exactly the roles listed in `READER_ROLES`, a comma-separated list compared case-insensitively and ignoring surrounding whitespace and empty entries. Without the variable, or with an empty one, a reader SHALL hold no role. Nothing a request carries — a cookie, a header, a query parameter, a stored preference — SHALL add a role to that set or remove one from it, except the student-view downgrade, which narrows it as it narrows a session's roles.

The reader roles SHALL be decided by the rules that decide a session's roles: the plural aliases, the admin short-circuit, the student-view downgrade, the exam gate and its practice counterpart, and the rule that a directive never grants itself. A reader has no display name, so no directive addressing a person by name SHALL be granted to it.

Wherever another capability speaks of an authenticated session, a request to an instance without an identity provider SHALL count as one holding the reader roles.

#### Scenario: No reader roles

- **WHEN** an instance without an identity provider has no `READER_ROLES` and serves a page carrying `@@@ teacher` and `@@@ 4bhif` blocks
- **THEN** neither block's content appears
- **AND** files whose first line restricts them are refused by direct path and absent from the navigation tree

#### Scenario: Reader roles that include the teacher role

- **WHEN** `READER_ROLES=teacher,examParticipant,4bhif`
- **THEN** every reader sees blocks addressed to `teacher`, `teachers`, `examParticipant` and `4bhif`
- **AND** blocks addressed only to `5bhif` or to a person by name stay hidden

#### Scenario: A reader cannot raise its own roles

- **WHEN** a reader of an instance whose reader roles do not include `teacher` sends a preference cookie with the exam view on
- **THEN** blocks addressed to `#exam` do not appear and the practice variant does

### Requirement: A reader's preferences and last visited page are kept in the reader's browser

Without an identity provider, the preferences a reader sets — the view toggles, light/dark, fonts and font size, start with the last visited page — and the page they visited last SHALL be stored in that reader's browser and SHALL be available to the server on every request that renders a page, so that the view preferences decide the page that request renders. They SHALL be kept per browser; the instance SHALL NOT store them. A preference block that is missing or does not parse SHALL be read as the default preferences, which narrow rather than widen what is shown.

#### Scenario: A toggle changes the next page

- **WHEN** a reader holding `teacher` through the reader roles switches the teacher view off
- **THEN** the pages it renders afterwards are the student view of the corpus, until it switches the view back on

#### Scenario: Two browsers are independent

- **WHEN** one browser switches the exam view on and a second browser reads the same page
- **THEN** the second browser is shown the variant its own preferences select

#### Scenario: Start with the last visited page

- **WHEN** a reader with "start with the last visited page" on opens the instance's root after having read a page
- **THEN** it is sent to that page

#### Scenario: A malformed preference block

- **WHEN** a request carries a preference block that does not parse
- **THEN** the page is rendered against the default preferences, and the request is not refused

### Requirement: Config parameters are taken from the request only where there is no identity

A request's parameters SHALL fall into two classes. **Config parameters** are a reader's persistent preferences: the view preferences that decide visibility (teacher view, exam view, answer view), "start with the last visited page", the last visited page itself, and the cosmetic preferences (light/dark, fonts, font size, line spacing). **Render parameters** select the presentation of one request only, for example the presentation view, the document view, print-to-PDF, or a heading to scroll to.

Only an instance without an identity provider SHALL take config parameters from the request, carried in a cookie. Wherever the application runs with an identity provider, it SHALL take config parameters only from the store it keeps them in for that identity: the identity provider's user attributes, or a store that replaces them later. It SHALL ignore any config parameter a request supplies by other means, whether cookie, header, query parameter or body field outside the endpoint that writes the store. Such a value SHALL NOT influence the page rendered, the navigation tree, the search results or the stored preferences, and the value from the store SHALL take its place. Anything else would open a side channel past the store the identity's preferences belong to.

Render parameters SHALL be taken from the request in every mode. They SHALL be carried in the URL and SHALL NOT be moved into a cookie, browser storage or any other store, so that a presentation, document or print view stays bookmarkable. They SHALL NOT be persisted, and the store SHALL NOT override them.

Under an identity provider, a stray config-parameter cookie SHALL only be ignored. The application SHALL NOT actively delete or overwrite it.

#### Scenario: Tier 2 ignores a forged preference cookie

- **WHEN** a session of an instance with the identity provider, whose stored preferences have the exam view off, sends a request carrying the preference cookie an instance without an identity provider would read, set to the exam view on and the teacher view on
- **THEN** the page is rendered against the stored preferences, so the practice variant appears and the exam variant does not
- **AND** the stored preferences are unchanged

#### Scenario: A forged last visited page

- **WHEN** such a session, with "start with the last visited page" on, opens the root while carrying a last-visited cookie that names a different page
- **THEN** it is sent to the page stored for its identity, or to the start page if none is stored

#### Scenario: A config parameter in the query string

- **WHEN** a session of an instance with the identity provider requests a page with `?ve=1&vt=1` appended
- **THEN** the page is rendered against the stored preferences

#### Scenario: Without an identity provider the cookie decides

- **WHEN** a reader of an instance without an identity provider sends the same preference cookie
- **THEN** the page is rendered against the preferences the cookie carries, within what its reader roles allow

#### Scenario: A stray preference cookie is left alone

- **WHEN** a session of an instance with the identity provider sends a request carrying the preference cookie an instance without an identity provider would read
- **THEN** the response carries no instruction to delete or change that cookie

#### Scenario: A bookmarked presentation view

- **WHEN** a reader opens a bookmarked URL ending in `?reveal=true` in a fresh browser that holds no cookies for the instance
- **THEN** the presentation view is shown, exactly as for the reader who bookmarked it, within what the new reader may see

#### Scenario: A render parameter is honoured in every mode

- **WHEN** a session with the identity provider, and a reader without one, each request a page with `?reveal=true`
- **THEN** both are shown the presentation view
- **AND** neither one's stored or cookie-carried preferences change because of it

### Requirement: Login, logout and the directory are absent without an identity provider

Without an identity provider, the application SHALL NOT offer a login or logout, SHALL NOT render a control that leads to one, and SHALL answer the paths that start or end a login the way it answers a path it does not serve. The directory search and directory status endpoints SHALL NOT be registered, and SHALL be answered the way an unserved path is answered, without directory data. The view toggles SHALL be offered whenever the reader roles allow them, exactly as they are offered to a session holding the same roles.

#### Scenario: The menu without an identity provider

- **WHEN** a reader opens the menu of a rendered page
- **THEN** it contains no logout control
- **AND** with `teacher` among the reader roles it contains the teacher, exam and answer toggles

#### Scenario: A login path

- **WHEN** a request asks for the path that would start a login or receive its callback
- **THEN** it is answered as an unserved path is answered and no identity provider is contacted

#### Scenario: The directory endpoints

- **WHEN** a request asks for the directory search or directory status endpoint, with or without a bearer token
- **THEN** no directory data is returned and no identity provider is contacted

### Requirement: Attachments are decided without a session

Without an identity provider, an attachment request SHALL be decided by the attachment rule of `attachment-access` (an attachment is served where at least one of its references is visible), against the reader roles and the config parameters the request carries. The decision SHALL NOT depend on a server-side session, and the instance SHALL NOT keep per-reader state on the server to make it. Because every reader holds the same roles, two requests with the same view preferences SHALL receive the same decision for the same attachment, and that decision SHALL follow a change in visibility within the bound `attachment-access` states.

#### Scenario: An image of an unrestricted page

- **WHEN** a reader without reader roles loads a page whose image is referenced only there
- **THEN** the image is served

#### Scenario: An image referenced only from a restricted section

- **WHEN** a reader without reader roles requests an attachment referenced only inside an `@@@ teacher` block
- **THEN** it is answered as a missing file

#### Scenario: The teacher view toggled off

- **WHEN** a reader holding `teacher` through the reader roles switches the teacher view off and requests that same attachment
- **THEN** it is answered as a missing file, and switching the view back on serves it again

#### Scenario: No per-reader state

- **WHEN** many distinct readers request pages and attachments
- **THEN** the instance holds no server-side state per reader
