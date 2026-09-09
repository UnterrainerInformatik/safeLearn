## MODIFIED Requirements

### Requirement: Logging in never hands a password to the plugin

The system SHALL obtain the plugin's identity by directing the person to the configured instance's own Keycloak login, completed in the system's default browser rather than in any field the plugin itself renders, and SHALL NOT ask for, receive, or store a password at any point. Where a login does not complete, the system SHALL report that rather than leaving it to be inferred from a control that has not changed; what is reported is `plugin-login-state`'s.

#### Scenario: A login is started

- **WHEN** a person starts the login with an instance configured
- **THEN** the system's default browser opens to that realm's own login page, and no password field appears inside Obsidian

#### Scenario: A login completes

- **WHEN** the browser-based login succeeds
- **THEN** the plugin holds proof of identity obtained through that exchange, without having handled the password that produced it

#### Scenario: A login is abandoned

- **WHEN** the browser-based login is closed or fails before completing
- **THEN** the plugin holds no identity, nothing that depends on one is offered, and the abandonment is reported rather than left to be read off an unchanged control

### Requirement: A held identity survives a restart and renews itself

Once obtained, the plugin's identity SHALL remain usable across restarts of Obsidian without a person logging in again, and SHALL be kept current in the background for as long as the underlying login remains valid. The renewal that follows a restart takes time and SHALL NOT hold up the start of the application; for as long as it has not concluded, the system SHALL present itself as a login in progress and SHALL NOT present itself as holding no identity.

#### Scenario: Obsidian restarts after a login

- **WHEN** Obsidian is closed and reopened after a successful login
- **THEN** the previously obtained identity is still usable without logging in again

#### Scenario: The renewal after a restart has not concluded

- **WHEN** Obsidian has started, an identity was held when it last ran, and the renewal of that identity has not yet concluded
- **THEN** what is shown is a login in progress, not an absent one, and the start of the application was not held up waiting for it

#### Scenario: The held identity has expired or was revoked

- **WHEN** the plugin attempts to use an identity that Keycloak no longer accepts, and it cannot be renewed in the background
- **THEN** it is treated as not logged in, and nothing that depends on it is offered until a login succeeds again
