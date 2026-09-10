# plugin-login-state Specification

## Purpose

Makes the plugin's login legible: at any moment a person can tell which of five named situations they are in, sees that without hunting for it, and is told what went wrong in the words of what the plugin itself observed — without being handed a way to tell apart the two refusals `directory-search` deliberately makes identical.

## Requirements

### Requirement: The login is in exactly one of five named states

The system SHALL hold the login in exactly one of five states at any moment — *not logged in*, *logging in*, *logged in*, *logged in without the directory role*, *login failed* — and every place that shows anything about the login SHALL show the state it is in. No place SHALL present the login as a two-way choice that leaves three of the five unnamed.

#### Scenario: No identity is held and none is being obtained

- **WHEN** the plugin holds no proof of identity and no login is in progress
- **THEN** the state is *not logged in*

#### Scenario: A login has been started and has not concluded

- **WHEN** a login has been started and neither succeeded, failed nor expired
- **THEN** the state is *logging in*

#### Scenario: An identity is held that carries the directory role

- **WHEN** the plugin holds a usable identity whose own claims carry the teacher or admin role
- **THEN** the state is *logged in*

#### Scenario: An identity is held that does not carry the directory role

- **WHEN** the plugin holds a usable identity whose own claims carry neither the teacher nor the admin role
- **THEN** the state is *logged in without the directory role*, distinct from both *logged in* and *not logged in*

#### Scenario: The last attempt ended in failure

- **WHEN** a login attempt has concluded without producing an identity
- **THEN** the state is *login failed* and stays so until a further attempt is started or the failure is dismissed

### Requirement: Each state names its own particulars

The system SHALL show, with the state, the particulars that distinguish one instance of that state from another: for *logging in*, when it was started and which instance it is running against; for either logged-in state, who is logged in; for *login failed*, the cause. A state name alone SHALL NOT be treated as sufficient where such a particular exists.

#### Scenario: A login is in progress

- **WHEN** the state is *logging in*
- **THEN** what is shown names when it was started and which safeLearn instance it is running against

#### Scenario: An identity is held

- **WHEN** the state is *logged in* or *logged in without the directory role*
- **THEN** what is shown names who is logged in

#### Scenario: A login has failed

- **WHEN** the state is *login failed*
- **THEN** what is shown names the cause

### Requirement: Restoring a stored login after a restart is a login in progress

The renewal of a stored identity at start-up SHALL NOT hold up the start of the application, and for as long as it has not concluded the system SHALL be in the state *logging in* rather than *not logged in*. When it concludes, the state SHALL follow its outcome without a person having acted.

#### Scenario: The application starts holding a stored login

- **WHEN** the application starts, an identity was held when it last ran, and its renewal has not concluded
- **THEN** the state is *logging in*, and the start of the application was not held up waiting for it

#### Scenario: The renewal concludes

- **WHEN** a renewal begun at start-up succeeds or fails
- **THEN** the state follows that outcome, and every place showing the login shows the new state without a person having acted

### Requirement: The current state is readable without opening the settings

The system SHALL carry the current state in a place that is readable for as long as that state lasts, without the settings being open, since a login concludes long after the click that started it and where a person is looking by then is not where they clicked. That place SHALL be absent — not empty, not neutral — while no instance is configured, as `plugin-directory-auth` requires of everything that depends on one.

#### Scenario: A login concludes with the settings closed

- **WHEN** a login concludes while the settings are not open
- **THEN** the new state is readable without opening them

#### Scenario: No instance is configured

- **WHEN** no instance URL is configured
- **THEN** nothing about the login is shown anywhere, and its absence is not itself announced

### Requirement: A change of state is announced once

The system SHALL announce a change of state where a person is working, once per change. It SHALL NOT re-announce a state that has not changed, and SHALL NOT rely on that announcement as the only account of the state — the announcement is transient and the readable place of the previous requirement is not.

#### Scenario: A login succeeds

- **WHEN** the state changes to *logged in* or to *logged in without the directory role*
- **THEN** the change is announced once

#### Scenario: A login fails

- **WHEN** the state changes to *login failed*
- **THEN** the change is announced once, and the announcement names the cause

#### Scenario: The state has not changed

- **WHEN** a check or a redraw finds the state unchanged
- **THEN** nothing is announced

### Requirement: A failed login names what the plugin itself observed

The system SHALL name, as the cause of a failure, what the plugin observed on its own account, and SHALL make that cause readable where the state is read rather than only in a developer log. At least these causes SHALL be told apart: the configured instance could not be reached; the configured Keycloak URL or realm does not resolve; the identity provider refused the exchange, with the status it refused with; the callback carried no authorization code; the redirect is not registered for the client; the login was cancelled; the login expired without a callback.

#### Scenario: The identity provider refuses the exchange

- **WHEN** the exchange of an authorization code is refused
- **THEN** the state is *login failed*, the cause names that the refusal came from the identity provider, and it carries the status the refusal carried

#### Scenario: The configured instance cannot be reached

- **WHEN** the configured instance or realm cannot be reached at all
- **THEN** the cause says so, and is distinguishable from a refusal by the identity provider

#### Scenario: A cause is shown

- **WHEN** any cause is shown
- **THEN** it is readable where the state is read, and reading a developer log is not required to learn it

### Requirement: What is shown never differentiates the server's refusal

The system SHALL derive whether the directory role is held from the claims of the identity the plugin itself holds, never from how the safeLearn server answered a request. A refused request SHALL NOT change the shown login state, and nothing shown SHALL let a caller tell a refusal for want of an identity from a refusal for want of a role — `directory-search` makes those two indistinguishable on purpose, and this capability SHALL NOT undo it.

#### Scenario: The directory role is determined

- **WHEN** the system determines whether the directory role is held
- **THEN** it reads the claims of the identity the plugin holds, and does not consult the server's answer to any request

#### Scenario: A directory request is refused

- **WHEN** a request to the safeLearn server is refused
- **THEN** the shown login state is unchanged, and nothing shown reveals which of the two grounds the refusal rested on

### Requirement: The directory role is read against the server's configured client, not the plugin's own

Where the system reads the held identity's own claims to decide whether the teacher or admin role is present (per "The login is in exactly one of five named states" and "What is shown never differentiates the server's refusal"), a client-role check SHALL look under `resource_access` for the configured server client id (`plugin-directory-auth`'s new setting), never under the plugin's own client id — a role granted as a direct Keycloak client role is only ever visible there, since the plugin's own client is never assigned client roles of its own. The `ldap` claim check SHALL continue to run regardless of the client-role result, exactly as before; the two remain the same either-or they already were.

#### Scenario: The role is granted as a direct client role

- **WHEN** the held identity's token carries `resource_access` for the configured server client id, and it includes the teacher or admin role
- **THEN** the state is *logged in*, regardless of what the token's own `azp` is

#### Scenario: Neither source carries the role

- **WHEN** `resource_access` for the configured server client id carries neither role, and the `ldap` claim carries neither
- **THEN** the state is *logged in without the directory role*

### Requirement: A callback that belongs to another window is reported where it arrives

A callback is delivered to whichever window of the application is frontmost, not to the one that started the login. The system SHALL, on receiving a callback for a login it is not itself waiting on, say so where it received it, rather than discarding it in silence. It SHALL NOT complete a login it did not start, and SHALL NOT require the two windows to know of each other.

#### Scenario: A callback for another window arrives

- **WHEN** a callback arrives carrying a login this window did not start
- **THEN** it is reported here as a login belonging to another window, and no identity is obtained from it

#### Scenario: The window that started the login is still waiting

- **WHEN** a login started here is still in progress and its callback went elsewhere
- **THEN** the state here stays *logging in* until it expires, and this window makes no claim about where the callback went

### Requirement: A login in progress expires on its own

The system SHALL give a login in progress a bounded lifetime and SHALL end it when that lifetime passes, moving to *login failed* with a cause naming that no callback arrived. A login in progress SHALL NOT be retained beyond that point.

#### Scenario: No callback arrives

- **WHEN** a login has been in progress past its lifetime and no callback has arrived
- **THEN** the state becomes *login failed*, the cause names that no callback arrived, and nothing is retained for that login

#### Scenario: A callback arrives after expiry

- **WHEN** a callback arrives for a login that has already expired
- **THEN** no identity is obtained from it and it is reported as belonging to a login that is no longer in progress

### Requirement: Retrying is reachable from every state, and a login in progress can be cancelled

The system SHALL offer a way to start a login again from every state, *logging in* and *login failed* included, and SHALL offer a way to end a login in progress without waiting for it to expire. Starting again SHALL supersede any login already in progress rather than adding to it.

#### Scenario: A login has failed

- **WHEN** the state is *login failed*
- **THEN** starting a login again is reachable without first logging out, restarting, or reconfiguring anything

#### Scenario: A login is in progress

- **WHEN** the state is *logging in*
- **THEN** both ending it and starting again are reachable, and starting again leaves exactly one login in progress
