## ADDED Requirements

### Requirement: No secret travels inside the published image

The container image built by the pipeline is pushed to a registry and SHALL be treated as public. It SHALL NOT contain any secret of a deployment: not the session secret, not the identity-provider configuration that carries the OIDC client secret, and not the credentials of the directory service client. A deployment SHALL receive these values only at runtime, either through the container's environment or through a file mounted into the container. Values that are not secret (ports, URLs, the start page) MAY still be baked into the image.

The repository's deployment checks SHALL fail when the pipeline writes a secret into a file that ends up in the image, and when a secret the application needs at runtime is not delivered through one of the two runtime channels.

#### Scenario: The published image is inspected

- **WHEN** anyone pulls the image the pipeline pushed and reads its layers
- **THEN** they find neither the session secret nor the identity-provider configuration nor the directory service credentials

#### Scenario: A deployed instance starts

- **WHEN** the deployment starts the container built from that image
- **THEN** the application finds the session secret in its environment and the identity-provider configuration in its working directory, and starts signed in against the identity provider as before

#### Scenario: The pipeline is changed to bake a secret in again

- **WHEN** the pipeline writes the session secret into the image's own `.env`, or writes the identity-provider configuration into a directory the image copies
- **THEN** the deployment checks fail and name the secret and the channel it should take instead

#### Scenario: The identity-provider configuration is not delivered

- **WHEN** the compose file stops mounting the identity-provider configuration, or the pipeline stops writing the file the mount reads
- **THEN** the deployment checks fail before an instance is deployed that would refuse to start
