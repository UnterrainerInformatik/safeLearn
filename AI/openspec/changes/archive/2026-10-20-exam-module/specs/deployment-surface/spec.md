## ADDED Requirements

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
