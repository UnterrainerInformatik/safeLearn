## Purpose

Defines what a running SafeLearn instance publishes over HTTP beyond the pages it renders, and what it demands of its environment before it will serve anything at all. Rendered content is governed by the permission directives; this capability governs everything else a browser can ask a deployment for — the assets a page needs, the files it must never hand out, and the per-deployment secret that makes a session cookie mean something.

## ADDED Requirements

### Requirement: Only the files a page needs are served as static assets

The application SHALL serve static files from an enumerated set of locations, each of them in the set because the application addresses it — a rendered page references it, or the application itself names it. Any path outside that set SHALL be answered as if the file were not there, whether or not it exists on disk. Adding a file to the application directory SHALL NOT make it retrievable.

#### Scenario: A page's own assets are retrievable

- **WHEN** an authenticated session requests a stylesheet, a font, an icon, the client script, or an image that a rendered page references
- **THEN** the file is served
- **AND** no page in the application renders with a reference that the server refuses

#### Scenario: A deployment configures no start page

- **WHEN** a deployment names no start page and an authenticated session asks for the application's root
- **THEN** it is answered with the fallback start page, which is part of the served set
- **AND** the fallback is not a path the application answers by sending the session to the start page, which would be itself

#### Scenario: A file outside the served set is requested

- **WHEN** an authenticated session requests a path that no rendered page references — regardless of whether a file exists at that path in the application directory
- **THEN** the request is not answered with that file's contents

### Requirement: Application sources and configuration are not retrievable

The application SHALL NOT serve its own source files, its dependency manifests, or any configuration file to any client, authenticated or not. This holds specifically for the identity-provider configuration, which carries the OIDC client secret and is present in the application directory of every deployment because the application reads it from there at startup.

#### Scenario: The identity-provider configuration is requested

- **WHEN** any client requests the file holding the OIDC client credentials
- **THEN** the response does not contain it
- **AND** the response is indistinguishable from one for a path where no file exists, so the answer does not confirm that the deployment has such a file

#### Scenario: Application sources or manifests are requested

- **WHEN** any client requests a server-side source file or a dependency manifest of the application
- **THEN** the response does not contain it

#### Scenario: A dependency's files are requested

- **WHEN** any client requests a file from the installed dependency tree other than the browser-side modules a rendered page imports
- **THEN** the response does not contain it
- **AND** installing a further dependency does not by itself make any of its files retrievable

### Requirement: A deployment supplies its own session secret

The application SHALL take the secret that signs session cookies from its environment, and SHALL refuse to start when it is absent. It SHALL NOT fall back to a built-in value: a secret compiled into a public source tree is known to everyone who can read it, and one shared across deployments makes each deployment's cookies verifiable by every other.

#### Scenario: The secret is configured

- **WHEN** the deployment provides a session secret in its environment
- **THEN** the application starts and signs session cookies with it

#### Scenario: The secret is missing

- **WHEN** the application starts without a session secret in its environment
- **THEN** it terminates with a message naming the variable to set and where a deployment sets it
- **AND** it does not begin serving requests

#### Scenario: An operator deploys the new version

- **WHEN** a deployment that had been running on the built-in secret starts with a secret of its own
- **THEN** cookies issued under the old secret are no longer accepted and the affected users authenticate again

### Requirement: Sessions are held in memory, deliberately

Session state SHALL be held in the application's own process. This bounds a deployment to a single instance and discards every session when that instance restarts, which is accepted: the deployment is one container, and the alternative buys resilience this installation has not asked for at the cost of a service to operate. The constraint SHALL be recorded where an operator meets it, so that it is a decision with a known price rather than an oversight to be rediscovered.

#### Scenario: The application restarts

- **WHEN** the application is restarted or redeployed
- **THEN** every session is gone and users authenticate again
- **AND** this is documented behavior, not a fault

#### Scenario: A second instance is considered

- **WHEN** an operator plans to run more than one instance behind a load balancer
- **THEN** the documentation tells them the session store must be replaced first, because two instances would not recognize each other's sessions
