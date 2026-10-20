## MODIFIED Requirements

### Requirement: A deployment supplies its own session secret

Wherever the application runs with an identity provider, it SHALL take the secret that signs session cookies from its environment, and SHALL refuse to start when it is absent. It SHALL NOT fall back to a built-in value: a secret compiled into a public source tree is known to everyone who can read it, and one shared across deployments makes each deployment's cookies verifiable by every other.

An instance that runs without an identity provider keeps no sessions and SHALL start without a session secret. It SHALL NOT issue a cookie that it would rely on as proof of anything.

#### Scenario: The secret is configured

- **WHEN** the deployment provides a session secret in its environment
- **THEN** the application starts and signs session cookies with it

#### Scenario: The secret is missing

- **WHEN** the application starts with the identity provider and without a session secret in its environment
- **THEN** it terminates with a message naming the variable to set and where a deployment sets it
- **AND** it does not begin serving requests

#### Scenario: An operator deploys the new version

- **WHEN** a deployment that had been running on the built-in secret starts with a secret of its own
- **THEN** cookies issued under the old secret are no longer accepted and the affected users authenticate again

#### Scenario: No identity provider, no secret

- **WHEN** an instance starts with `AUTH=none` and without a session secret
- **THEN** it starts and serves the corpus

## ADDED Requirements

### Requirement: The deployed instance states that it runs with the identity provider

The deployment that publishes the school's material SHALL state its authentication mode explicitly as `AUTH=keycloak` and pass it to the running container, rather than relying on the default. The repository's deployment checks SHALL fail when that deployment does not pass `AUTH=keycloak`, or when it passes any other value. `READER_ROLES` SHALL count as a variable a deployment need not set, because its absence grants no role.

#### Scenario: The deployment configuration is checked

- **WHEN** the deployment checks run against the repository
- **THEN** they pass only if the deployment's container receives `AUTH=keycloak`

#### Scenario: The deployment is switched to publishing by mistake

- **WHEN** the deployment configuration is changed to pass `AUTH=none`, or stops passing `AUTH`
- **THEN** the deployment checks fail and name the variable
