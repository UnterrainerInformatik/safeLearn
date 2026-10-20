# deployment-surface Specification

## Purpose

Defines what a running SafeLearn instance publishes over HTTP beyond the pages it renders, and what it demands of its environment before it will serve anything at all. Rendered content is governed by the permission directives; this capability governs everything else a browser can ask a deployment for — the assets a page needs, the files it must never hand out, and the per-deployment secret that makes a session cookie mean something.

## Requirements

### Requirement: Only the files a page needs are served as static assets

The application SHALL serve static files from an enumerated set of locations, each of them in the set because the application addresses it: a rendered page references it, or the application itself names it. Any path outside that set SHALL be answered as if the file were not there, whether or not it exists on disk. Adding a file to the application directory SHALL NOT make it retrievable. Files under the corpus directory are attachments and are additionally governed by `attachment-access`: being in the served set makes an attachment eligible, and whether a given session is served it is decided there.

#### Scenario: A page's own assets are retrievable

- **WHEN** an authenticated session requests a stylesheet, a font, an icon or the client script that a rendered page references
- **THEN** the file is served
- **AND** no page in the application renders with a reference to one of these that the server refuses

#### Scenario: A page's attachments are retrievable by the session that sees them

- **WHEN** an authenticated session requests an image or another attachment that a page rendered for that session references
- **THEN** the file is served
- **AND** no page renders, for any session, a reference to an attachment that the server then refuses that same session

#### Scenario: A deployment configures no start page

- **WHEN** a deployment names no start page and an authenticated session asks for the application's root
- **THEN** it is answered with the fallback start page, which is part of the served set
- **AND** the fallback is not a path the application answers by sending the session to the start page, which would be itself

#### Scenario: A file outside the served set is requested

- **WHEN** an authenticated session requests a path that no rendered page references, whether or not a file exists at that path in the application directory
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

### Requirement: Sessions are held in memory, deliberately

Session state SHALL be held in the application's own process. This bounds a deployment to a single instance and discards every session when that instance restarts, which is accepted: the deployment is one container, and the alternative buys resilience this installation has not asked for at the cost of a service to operate. The constraint SHALL be recorded where an operator meets it, so that it is a decision with a known price rather than an oversight to be rediscovered.

#### Scenario: The application restarts

- **WHEN** the application is restarted or redeployed
- **THEN** every session is gone and users authenticate again
- **AND** this is documented behavior, not a fault

#### Scenario: A second instance is considered

- **WHEN** an operator plans to run more than one instance behind a load balancer
- **THEN** the documentation tells them the session store must be replaced first, because two instances would not recognize each other's sessions

### Requirement: The unauthenticated reload endpoint survives malformed input

The endpoint a rendered page subscribes to for reload notifications is reachable without authentication by design — it carries no content, only the paths that changed and the kind of reload to perform. Being the one endpoint that answers before any authentication has happened, it SHALL treat everything a client sends it as hostile. A parameter it cannot interpret SHALL be handled as an absent one: the subscription SHALL be established, and the handler SHALL NOT raise. A client SHALL NOT be able to provoke an error inside the application by the shape of what it sends.

#### Scenario: A subscription carrying an uninterpretable parameter

- **WHEN** any client, authenticated or not, subscribes to the reload endpoint with a context parameter that cannot be interpreted
- **THEN** the subscription is established exactly as it would be without the parameter
- **AND** the client receives the reload notifications it would otherwise receive, decided as though no context had been given
- **AND** no error is raised inside the application

#### Scenario: A subscription without the parameter

- **WHEN** a client subscribes without a context parameter at all
- **THEN** the subscription is established, unchanged by this requirement

### Requirement: The directory search endpoint is inert without a currently-valid teacher or admin identity

The directory search endpoint SHALL be treated as part of the deployment's checked HTTP surface: a request that does not currently prove a valid teacher or admin identity SHALL receive no directory data, regardless of whether a session cookie is present. The credentials the endpoint uses to reach the directory on the caller's behalf SHALL NOT be observable in any response, error message, or log reachable by a client.

#### Scenario: An unauthenticated request reaches the search endpoint

- **WHEN** a request to the search endpoint carries no proof of identity
- **THEN** no directory data is returned

#### Scenario: A session cookie alone is not sufficient

- **WHEN** a request carries a valid browser session but no valid teacher-or-admin proof of identity for the endpoint itself
- **THEN** no directory data is returned

#### Scenario: The endpoint's own outbound credentials are not exposed

- **WHEN** any response is produced by the search endpoint, successful or not
- **THEN** the response contains none of the credentials the deployment uses to authenticate itself to the directory

### Requirement: The application fetches no URL a request names

No route SHALL make the application fetch a resource whose address the request supplies, whether as a query parameter, a body field or a header. In particular, the application SHALL NOT forward a request's `Cookie` or `Authorization` header to any host a request names. The conversion route `/convert`, which did both, SHALL NOT exist. A request to it, by `GET` or `POST`, with or without parameters, SHALL be answered exactly as any other path the application does not serve: an authenticated session is sent to the start page, and a request without a session is answered as `checkAuthenticated` answers it.

#### Scenario: A session asks the server to fetch a URL

- **WHEN** an authenticated session requests `GET /convert?url=http://internal.example/`
- **THEN** the application makes no outbound request
- **AND** the session is sent to the start page, as for an unserved path

#### Scenario: A session posts Markdown or a URL for conversion

- **WHEN** an authenticated session posts `{"content": "…"}` or `{"url": "…"}` to `/convert`
- **THEN** no Markdown is rendered and no outbound request is made
- **AND** the answer is the same as for a `POST` to any other unserved path

#### Scenario: The answer reveals nothing about the former route

- **WHEN** an authenticated session requests `/convert` and, separately, a path that never existed
- **THEN** both answers have the same status and the same redirect target

### Requirement: The exam module is switched on by the deployment's environment and keeps its data on the persistent volume

A deployment that runs the exam module SHALL pass `EXAM_MODULE` to the container through its environment, not through a file baked into the image, and SHALL mount the data directory the module writes its database to as a persistent volume. The database file, its backups and the module's stored images SHALL NOT be retrievable over HTTP by any path, whether or not a session is present. Images SHALL reach a browser only through module routes that check the requester's access.

#### Scenario: The variable reaches the container

- **WHEN** the deployment configuration is checked against the application's sources
- **THEN** `EXAM_MODULE` is among the variables that reach every deployed instance through the compose file's environment

#### Scenario: Requesting the database file

- **WHEN** any session requests a path naming the database file, a backup of it, or a stored image's file
- **THEN** the request is not answered with that file's contents

#### Scenario: The WYSIWYG container

- **WHEN** the WYSIWYG container template is started as shipped
- **THEN** it sets no `EXAM_MODULE` and mounts no data volume, and the instance runs without the module

### Requirement: The deployed instance states that it runs with the identity provider

The deployment that publishes the school's material SHALL state its authentication mode explicitly as `AUTH=keycloak` and pass it to the running container, rather than relying on the default. The repository's deployment checks SHALL fail when that deployment does not pass `AUTH=keycloak`, or when it passes any other value. `READER_ROLES` SHALL count as a variable a deployment need not set, because its absence grants no role.

#### Scenario: The deployment configuration is checked

- **WHEN** the deployment checks run against the repository
- **THEN** they pass only if the deployment's container receives `AUTH=keycloak`

#### Scenario: The deployment is switched to publishing by mistake

- **WHEN** the deployment configuration is changed to pass `AUTH=none`, or stops passing `AUTH`
- **THEN** the deployment checks fail and name the variable
