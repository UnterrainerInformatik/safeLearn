# plugin-directory-auth Specification

## Purpose
Gives the plugin its own login against the school's Keycloak realm, kept separate from the safeLearn server's browser session, so a directory query or any other admin-API call it makes can prove who is asking — and keeps every feature that depends on it inert wherever no safeLearn instance is configured.

## Requirements

### Requirement: A safeLearn instance is configured per vault

The system SHALL offer a setting holding the base URL of a safeLearn instance. This setting SHALL be treated as unset until a value has been entered, since the same plugin is installed by people with no safeLearn instance of their own.

#### Scenario: No instance is configured

- **WHEN** the plugin is installed and no instance URL has been entered
- **THEN** the setting reads as unset

#### Scenario: An instance URL is entered

- **WHEN** a person enters a URL into the setting
- **THEN** the setting holds that value

### Requirement: Everything that depends on a configured instance stays silent without one

Nothing that requires a configured safeLearn instance — logging in, and anything built on the identity that produces — SHALL raise an error, show a failure notice, or otherwise draw attention to its own absence while no instance is configured. It SHALL simply not be offered.

#### Scenario: No instance is configured

- **WHEN** no instance URL is configured
- **THEN** no control that depends on a login is shown or reachable, and nothing is logged or notified about that absence

#### Scenario: An instance becomes configured

- **WHEN** an instance URL is entered where none was set before
- **THEN** the controls that depend on it become reachable, without restarting Obsidian

### Requirement: Logging in never hands a password to the plugin

The system SHALL obtain the plugin's identity by directing the person to the configured instance's own Keycloak login, completed in the system's default browser rather than in any field the plugin itself renders, and SHALL NOT ask for, receive, or store a password at any point.

#### Scenario: A login is started

- **WHEN** a person starts the login with an instance configured
- **THEN** the system's default browser opens to that realm's own login page, and no password field appears inside Obsidian

#### Scenario: A login completes

- **WHEN** the browser-based login succeeds
- **THEN** the plugin holds proof of identity obtained through that exchange, without having handled the password that produced it

#### Scenario: A login is abandoned

- **WHEN** the browser-based login is closed or fails before completing
- **THEN** the plugin holds no identity, and nothing that depends on one is offered

### Requirement: A held identity survives a restart and renews itself

Once obtained, the plugin's identity SHALL remain usable across restarts of Obsidian without a person logging in again, and SHALL be kept current in the background for as long as the underlying login remains valid.

#### Scenario: Obsidian restarts after a login

- **WHEN** Obsidian is closed and reopened after a successful login
- **THEN** the previously obtained identity is still usable without logging in again

#### Scenario: The held identity has expired or was revoked

- **WHEN** the plugin attempts to use an identity that Keycloak no longer accepts, and it cannot be renewed in the background
- **THEN** it is treated as not logged in, and nothing that depends on it is offered until a login succeeds again

### Requirement: A person can log out on demand

The system SHALL offer a way to discard the held identity, after which the plugin holds no proof of identity until logging in again.

#### Scenario: A person logs out

- **WHEN** a person invokes the log-out control
- **THEN** the held identity is discarded, and nothing that depends on a login is offered until logging in again
