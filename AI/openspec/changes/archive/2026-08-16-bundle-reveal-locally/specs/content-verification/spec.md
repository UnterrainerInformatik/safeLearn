## MODIFIED Requirements

### Requirement: The presentation and document views are proven structurally

The same source file is served as a page, as a presentation and as a printable document. A check SHALL prove that the presentation view is built from the source's heading structure, that it is self-contained, and that the document view is the content without the page shell.

#### Scenario: The deck's structure

- **WHEN** a corpus presentation is requested as a presentation
- **THEN** the deck contains one horizontal section per top-level heading of the source
- **AND** headings one level below produce vertical sections inside the section they belong to

#### Scenario: The presentation's own references resolve

- **WHEN** the presentation view is rendered
- **THEN** every stylesheet and script it references from this application resolves and is served as what it claims to be
- **AND** no such reference falls through to the application's catch-all redirect

#### Scenario: The presentation contacts no third party

- **WHEN** the presentation view is rendered
- **THEN** the check reads the hosts the browser actually contacted, rather than the addresses the markup names, so a request a stylesheet issued is seen too
- **AND** the run fails if any host other than the application under test and its identity provider was contacted
- **AND** the failure names the host and the address that caused the request

#### Scenario: A reference that is known to be broken

- **WHEN** a reference is dangling today and its repair belongs to a different change
- **THEN** it is listed by name as a known exception, so the check reports it without failing the run
- **AND** any dangling reference not on that list fails the run
- **AND** an entry on the list that no longer dangles fails the run, so the exception cannot outlive its repair

#### Scenario: The document view

- **WHEN** a corpus page is requested as a document
- **THEN** the rendered content is present without the navigation tree and top bar
- **AND** the content matches what the page view shows for the same session
