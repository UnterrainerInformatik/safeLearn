## ADDED Requirements

### Requirement: The directory role is read against the server's configured client, not the plugin's own

Where the system reads the held identity's own claims to decide whether the teacher or admin role is present (per "The login is in exactly one of five named states" and "What is shown never differentiates the server's refusal"), a client-role check SHALL look under `resource_access` for the configured server client id (`plugin-directory-auth`'s new setting), never under the plugin's own client id — a role granted as a direct Keycloak client role is only ever visible there, since the plugin's own client is never assigned client roles of its own. The `ldap` claim check SHALL continue to run regardless of the client-role result, exactly as before; the two remain the same either-or they already were.

#### Scenario: The role is granted as a direct client role

- **WHEN** the held identity's token carries `resource_access` for the configured server client id, and it includes the teacher or admin role
- **THEN** the state is *logged in*, regardless of what the token's own `azp` is

#### Scenario: Neither source carries the role

- **WHEN** `resource_access` for the configured server client id carries neither role, and the `ldap` claim carries neither
- **THEN** the state is *logged in without the directory role*
