## MODIFIED Requirements

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
