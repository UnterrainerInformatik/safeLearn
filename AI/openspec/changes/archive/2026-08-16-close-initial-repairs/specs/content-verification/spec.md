## MODIFIED Requirements

### Requirement: The view pseudo-roles are proven against the preferences that drive them

The `#exam`, `#practice` and `#answer` directives are resolved from stored preferences and, for the exam variant, from the teacher or admin role. A check SHALL set the preferences the outcome depends on before reading the page, and SHALL prove each variant both present and absent.

The exam and practice variants SHALL additionally be proven complementary: for every combination of role and preference a check reads, exactly one of the two SHALL be present. Proving each variant on its own leaves the combination that shows neither undetected, which is the combination that was shipped.

#### Scenario: Exam and practice are mutually exclusive

- **WHEN** a teacher session sets the exam view and loads the exam/practice page
- **THEN** the exam variant of the question is present and the practice variant is absent
- **AND** with the exam view cleared, the practice variant is present and the exam variant is absent

#### Scenario: A student cannot reach the exam variant

- **WHEN** a student session requests the exam/practice page with the exam preference set
- **THEN** the exam variant is absent
- **AND** the practice variant is what the student sees

#### Scenario: A teacher reading the page in the student view

- **WHEN** a teacher session with the exam preference set switches the teacher view off and loads the exam/practice page
- **THEN** the practice variant is present and the exam variant is absent
- **AND** the question is the one a student session is shown on the same page

#### Scenario: The answer block

- **WHEN** the answer preference is set, and when it is cleared
- **THEN** the answer block is present in the first case and absent in the second, with no other preference changed between the two reads

### Requirement: Link and path resolution is proven for the corpus's edge cases

Wiki-links, file names and folder names in the corpus include the cases that broke before: a basename that exists twice, names containing spaces, and folder names carrying spaces, special characters and excessive length. Each SHALL be proven to resolve to a page that actually renders.

A duplicated basename SHALL be proven on a name that carries a digit as well as on one that does not, because the disambiguation path is built by string surgery whose failure depends on the characters in the name.

#### Scenario: A basename that exists twice

- **WHEN** a wiki-link addresses a file whose basename exists in more than one folder
- **THEN** the emitted link carries the path that disambiguates it
- **AND** following it arrives at the intended file

#### Scenario: A duplicated basename carrying a digit

- **WHEN** a wiki-link addresses a file whose basename exists in more than one folder and contains a digit
- **THEN** the emitted link addresses that file and nothing else — the digit is present in the path as written, and the link carries no character the name does not
- **AND** following it arrives at the intended file

#### Scenario: Names carrying spaces or special characters

- **WHEN** a link addresses a file or folder whose name contains spaces or special characters
- **THEN** following it arrives at that file rather than at the start page
- **AND** the name is displayed as written

#### Scenario: The navigation tree and the table of contents

- **WHEN** a corpus page is rendered
- **THEN** the navigation tree lists the folders and files the session may see
- **AND** the table of contents lists the page's headings, each addressing an anchor that exists in the page

### Requirement: The presentation and document views are proven structurally

The same source file is served as a page, as a presentation and as a printable document. A check SHALL prove that the presentation view is built from the source's heading structure, that it is self-contained, that the document view is the content without the page shell, and that the documented keyboard shortcut into the document view works with the modifier the documentation names.

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

#### Scenario: The keyboard shortcut into the document view

- **WHEN** the documented shortcut for the document view is pressed on a rendered page, with the shift key held and without it
- **THEN** the document view is reached in both cases
- **AND** neither case depends on the capitalization the key event reports
