# content-verification Specification

## Purpose

Defines what a verification run asserts about SafeLearn's own rendered output: that the demonstration files in `md/` are the source of the checks, what each area of behavior — permissions, views, rendering, links, presentation — must prove, how a check stays honest on accounts that are shared and whose preferences live server-side, and how a change to guarded code is connected to the checks that cover it.

## Requirements

### Requirement: The corpus in `md/` is what gets verified

The files under `md/` demonstrate SafeLearn's behavior and are read before every commit by hand. Each behavior a corpus file demonstrates SHALL be covered by a check, so that reading the corpus by hand becomes a choice rather than the only way to find a regression. The corpus SHALL remain readable as documentation: checks read it, and SHALL NOT rewrite a demonstration into a form that only a machine benefits from.

#### Scenario: A behavior demonstrated in the corpus

- **WHEN** a file under `md/` demonstrates a behavior — a directive, a callout, a link form, a layout, a diagram
- **THEN** a check asserts that behavior on the rendered page
- **AND** the check names the corpus file it reads, so the demonstration and its assertion can be found from each other

#### Scenario: A demonstration a check cannot reach

- **WHEN** a behavior in the corpus cannot be asserted without changing the application
- **THEN** it is recorded as a known gap in the project's testing documentation, naming the file and the behavior
- **AND** the application is not changed to make it assertable

#### Scenario: A fixture the corpus does not have

- **WHEN** a check needs a demonstration that no corpus file provides
- **THEN** a new file is added to the corpus for it
- **AND** no existing corpus file is edited in a way that changes what a human reading it sees

### Requirement: Content permissions are proven in both directions

A permission check SHALL prove both that permitted content appears and that restricted content is absent, for the same content in the same run. Asserting only that a page renders, or only that a role sees something, SHALL NOT be accepted as coverage of a permission rule — a rule that grants everyone passes such a check.

#### Scenario: Block-level directive

- **WHEN** a `@@@`-delimited block addresses a role
- **THEN** a session holding that role sees the block's content
- **AND** a session not holding it does not see that content anywhere in the rendered page

#### Scenario: Whole-file directive

- **WHEN** a file's first line restricts the whole file to a role
- **THEN** a session not holding that role neither reaches the file by direct path nor finds it in the navigation tree
- **AND** a session holding it reaches the file and finds it listed

#### Scenario: Time-bounded visibility

- **WHEN** a block carries a window that has not opened, or has already closed
- **THEN** its content is absent for every role the window names
- **AND** a block whose role carries no window is visible to that role in the same page, so an unrelated failure cannot be mistaken for the window working

#### Scenario: Teacher viewing as a student

- **WHEN** a teacher session sets the preference that drops the teacher view
- **THEN** the same page shows the teacher exactly what a student sees, including the disappearance of restricted files from the navigation tree
- **AND** restoring the preference restores the teacher's view of that page

#### Scenario: Class membership is not assumed

- **WHEN** a check asserts on content addressed to a class or group role
- **THEN** the expectation is derived from the roles the session actually carries
- **AND** the check does not hardcode which class an account is expected to belong to

### Requirement: The view pseudo-roles are proven against the preferences that drive them

The `#exam`, `#practice` and `#answer` directives are resolved from stored preferences and, for the exam variant, from the teacher or admin role. A check SHALL set the preferences the outcome depends on before reading the page, and SHALL prove each variant both present and absent.

#### Scenario: Exam and practice are mutually exclusive

- **WHEN** a teacher session sets the exam view and loads the exam/practice page
- **THEN** the exam variant of the question is present and the practice variant is absent
- **AND** with the exam view cleared, the practice variant is present and the exam variant is absent

#### Scenario: A student cannot reach the exam variant

- **WHEN** a student session requests the exam/practice page with the exam preference set
- **THEN** the exam variant is absent
- **AND** the practice variant is what the student sees

#### Scenario: The answer block

- **WHEN** the answer preference is set, and when it is cleared
- **THEN** the answer block is present in the first case and absent in the second, with no other preference changed between the two reads

### Requirement: Each render feature is proven individually

The render pipeline turns one Markdown source into HTML through a fixed chain of rewrites, and a break in one rewrite leaves the rest of the page intact. A check SHALL therefore assert per feature — per callout type, per fragment, per column layout, per link form — rather than asserting that the page as a whole rendered.

#### Scenario: Callouts

- **WHEN** the corpus page carrying every callout type is rendered
- **THEN** each type is present as its own styled element carrying its icon
- **AND** a collapsible callout is closed until it is opened and shows its content afterwards

#### Scenario: Fragments

- **WHEN** a page using fragment markers is rendered
- **THEN** each marked element carries its fragment index
- **AND** the index restarts at the heading boundaries the corpus demonstrates

#### Scenario: Side-by-side columns

- **WHEN** the two-column and the three-column demonstrations are rendered
- **THEN** each produces exactly that many columns
- **AND** content placed before and after the layout stays outside it

#### Scenario: Code blocks

- **WHEN** a fenced code block is rendered
- **THEN** it is present as highlighted markup rather than as plain text
- **AND** its content is unchanged by the link, callout and fragment rewrites that run around it

#### Scenario: Images and embeds

- **WHEN** the page's image forms are rendered — an absolute URL, an Obsidian embed, a repository-relative path, and the `|WxH` size suffix
- **THEN** each produces an element addressing the source it names
- **AND** the size suffix appears as the element's dimensions rather than as part of its description

### Requirement: Externally rendered content is asserted as emitted markup

Diagrams and remote images are produced by hosts this project does not control. A verification run SHALL assert what the application emits for them and SHALL NOT depend on those hosts answering. The identity provider remains the only external system a run requires.

#### Scenario: A diagram whose renderer is a remote service

- **WHEN** a page containing such a diagram is rendered
- **THEN** the check asserts the address the application emitted for it, including that the source was encoded as that service expects
- **AND** the run passes whether or not that service is reachable

#### Scenario: A diagram rendered in the browser

- **WHEN** a page containing a browser-rendered diagram is loaded
- **THEN** the check asserts the element and the script the application emitted for it
- **AND** the run does not depend on a content delivery network

#### Scenario: An image hosted elsewhere

- **WHEN** a page embeds an image by absolute URL
- **THEN** the check asserts the emitted address
- **AND** does not require the image to load

### Requirement: Link and path resolution is proven for the corpus's edge cases

Wiki-links, file names and folder names in the corpus include the cases that broke before: a basename that exists twice, names containing spaces, and folder names carrying spaces, special characters and excessive length. Each SHALL be proven to resolve to a page that actually renders.

#### Scenario: A basename that exists twice

- **WHEN** a wiki-link addresses a file whose basename exists in more than one folder
- **THEN** the emitted link carries the path that disambiguates it
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

### Requirement: Checks stay honest on shared accounts

The accounts a run authenticates with are public, and the preferences the application reads are stored per account on the identity provider. A check SHALL therefore write every preference its outcome depends on before reading the page, and SHALL assert only against values it wrote itself.

#### Scenario: A check that depends on a preference

- **WHEN** a check's expected outcome depends on dark mode, the start-page behavior, a view switch or a font setting
- **THEN** it writes that preference and confirms the page was rendered with it before asserting
- **AND** it does not assume any starting state

#### Scenario: Two runs against the same account

- **WHEN** a second run uses the same account while the first is still going
- **THEN** neither run reports a failure caused by the other's preference writes

#### Scenario: Addressing a page

- **WHEN** a check opens a page
- **THEN** it navigates to that page by path
- **AND** does not rely on where the login flow or the application's start-page redirect happens to land

### Requirement: A change to guarded code names the checks that cover it

Knowing that the checks exist is part of them working. The project SHALL record which checks guard which source files, and that record SHALL be surfaced when the guarded code is edited rather than relying on anyone remembering it.

#### Scenario: The coverage record

- **WHEN** someone reads the project's testing documentation
- **THEN** they find, per check file, which source files and which corpus files it guards
- **AND** the record is complete for every check the suite contains

#### Scenario: Editing guarded code

- **WHEN** a source file that the record names as guarded is edited in an assisted session
- **THEN** the checks covering it are named at that point
- **AND** the run of those checks is offered as the next step rather than performed unasked

#### Scenario: A check file is added or removed

- **WHEN** the suite gains or loses a check file
- **THEN** the coverage record is updated in the same change
- **AND** a record naming a check file that no longer exists is treated as a defect
