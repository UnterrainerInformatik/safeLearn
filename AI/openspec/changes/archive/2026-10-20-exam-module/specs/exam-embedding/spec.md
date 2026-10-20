## Purpose

Defines how an author places an exam-module element — a test, a student's results, a gradebook, a live view — inside an ordinary `md/` page, and what that page shows depending on whether the module is active and who is reading.

## ADDED Requirements

### Requirement: An element is placed by a fenced block naming its kind

An author SHALL place a module element by writing a fenced code block whose info string is `safelearn-<kind>` (for example `safelearn-test`, `safelearn-results`, `safelearn-gradebook`, `safelearn-live`). The block's body SHALL carry the element's parameters as `key: value` lines. A block whose kind the instance does not know SHALL be treated as a block with nothing to render. Fenced blocks of any other info string SHALL render exactly as they do today.

#### Scenario: A test placed in a lecture page

- **WHEN** a page contains a `safelearn-test` block naming a test
- **THEN** that position of the rendered page holds the element for that test and nothing of the block's source text

#### Scenario: An unknown kind

- **WHEN** a page contains a `safelearn-foo` block and no handler for `foo` exists
- **THEN** the page renders as if the block were absent

#### Scenario: Code blocks are unaffected

- **WHEN** a page contains a fenced block tagged `js`, `mermaid` or `plantuml`
- **THEN** it renders exactly as it did before this change

### Requirement: Placement is subject to the permission filter, and access is decided on the server again

An element block SHALL be removed together with the restricted section it sits in, exactly as any other content of that section. Being shown an element SHALL NOT grant anything: every request the element makes SHALL be authorized by the module on the server, as if no page existed.

#### Scenario: An element inside a teacher section read by a student

- **WHEN** a `safelearn-gradebook` block sits inside `@@@ teacher` and a student opens the page
- **THEN** the student's page contains no trace of the element

#### Scenario: A teacher-only element read by a teacher in student view

- **WHEN** a teacher in student view opens a page with a `safelearn-gradebook` or `safelearn-live` block, whether inside `@@@ teacher` or not
- **THEN** the page shows what a student's page shows in its place, and no request for the element is made

#### Scenario: A student calls the API an element would call

- **WHEN** a student requests a course's gradebook from the module API directly, without the page
- **THEN** the request is refused

### Requirement: With the module off, an element renders to nothing, and teachers see that it exists

When the module is not active, an element block SHALL render to no content for a session without the teacher role. For a teacher, it SHALL render to a short, unobtrusive notice that the element is only available on an instance with the database. The notice SHALL contain no data and SHALL make no request.

#### Scenario: The WYSIWYG container

- **WHEN** a teacher previews a page with a `safelearn-test` block on an instance without the module
- **THEN** the page shows the notice in place of the element
- **AND** the page makes no request to `/exam/`

#### Scenario: A student on an instance without the module

- **WHEN** a student opens the same page on that instance
- **THEN** the page shows nothing in place of the element

### Requirement: With the module on, the element mounts into a server-rendered page

When the module is active, the block SHALL render to a placeholder element that the client mounts the module's element into. The rest of the page SHALL be rendered on the server as it is today. The element SHALL NOT delay the moment the page is revealed: the page becomes visible under the page bootstrap rules, and the element shows its own loading state until its data arrives. An element that fails to load SHALL show that it failed, inside its own area, without affecting the page around it.

#### Scenario: The module API is slow

- **WHEN** a page with an element is opened and the module API takes several seconds to answer
- **THEN** the page is revealed at the same time it would be without the element
- **AND** the element area shows that it is loading until the answer arrives

#### Scenario: The module API fails

- **WHEN** the module API answers an element's request with an error
- **THEN** the element area states that it could not be loaded, and the rest of the page is unaffected

### Requirement: The presentation and document views do not run elements

In the presentation view and the document view, an element block SHALL render as it does with the module off. Interactive elements belong to the page view.

#### Scenario: A deck with an element

- **WHEN** a page containing a `safelearn-test` block is opened with `?reveal=1`
- **THEN** the deck contains the notice for teachers, or nothing for students, in place of the element
