## ADDED Requirements

### Requirement: The server's own Keycloak client id is configured per vault

The system SHALL offer a setting holding the Keycloak client id the safeLearn server itself is registered under (the value its own `keycloak.json`'s `resource` holds) — the client whose `resource_access` roles the directory endpoint's authorization actually reads — since that id varies per deployment the same way the Keycloak URL and realm already do, and is never the plugin's own client id. This setting SHALL default to this project's own convention (`safeLearn`) so an install pointed at the reference deployment needs no change.

#### Scenario: A deployment uses the default server client id

- **WHEN** the setting has not been changed from its default
- **THEN** it reads `safeLearn`, matching this project's own default `keycloak.json`

#### Scenario: A deployment uses a different server client id

- **WHEN** a person enters a different client id into the setting
- **THEN** the setting holds that value, and it is what the directory-role determination reads from `resource_access`
