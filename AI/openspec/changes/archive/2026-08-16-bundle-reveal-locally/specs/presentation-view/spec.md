## Purpose

Defines the presentation view — the third way SafeLearn serves a Markdown file, as a navigable slide deck rather than a page or a printable document. Governs where the deck's rendering engine comes from, the rule that a deck depends on nothing outside the deployment serving it, and the deck behavior a teacher relies on in front of a class.

## ADDED Requirements

### Requirement: The presentation view runs the version the project installs

The rendering engine behind the presentation view SHALL be the one the project declares as a dependency and installs into its deployments. The application SHALL NOT address a rendering engine by an absolute URL written into its source, because such a reference is bound to neither the declared version nor the installed one and drifts from both without anything reporting it.

#### Scenario: The declared version is the running version

- **WHEN** the presentation view is rendered
- **THEN** the engine it loads is the one recorded in the project's dependency manifest and present in the deployment's installed dependencies
- **AND** no other copy or version of that engine is loaded alongside it

#### Scenario: The dependency is upgraded

- **WHEN** the declared version of the rendering engine changes and the deployment is rebuilt
- **THEN** the presentation view runs the new version without any source file naming a version

#### Scenario: A support file is derived from the engine's own

- **WHEN** the application ships a stylesheet or asset derived from a file belonging to the rendering engine, because the original cannot be served as it stands
- **THEN** the derivation records which upstream version it was taken from and why it was not used unchanged
- **AND** an upgrade of the engine is thereby told that the derivation has to be revisited

### Requirement: A presentation depends on no host but the one serving it

Every asset the presentation view needs — engine, styles, plugins, fonts — SHALL be served by the deployment. A rendered deck SHALL NOT cause the browser to contact any other host, whether the request originates from an element on the page or from within a stylesheet the page loaded. A lesson SHALL NOT depend on the reachability of a third party, and opening a deck SHALL NOT disclose to a third party that it was opened.

#### Scenario: A deck is opened without internet access

- **WHEN** an authenticated session opens a presentation from a deployment that cannot reach any host but itself
- **THEN** the deck renders with its styling, navigation and fragments intact

#### Scenario: A deck is opened with internet access

- **WHEN** an authenticated session opens a presentation
- **THEN** the browser contacts no host other than the deployment and its identity provider
- **AND** this holds for requests a stylesheet issues as well as for those written into the page

#### Scenario: A font the deck's styling asks for

- **WHEN** the deck's styling names a font family
- **THEN** that family is served by the deployment from its own assets
- **AND** it is not fetched from a font-hosting service

### Requirement: The deck's behavior survives a change of engine

The presentation view exists to be driven in front of a class. Replacing or upgrading the rendering engine SHALL preserve what a teacher operates: moving through the deck, the stepwise reveal the corpus's directives produce, speaker notes, and export to PDF. An engine change MAY alter the deck's exact appearance; it SHALL NOT remove one of these.

#### Scenario: Moving through a deck

- **WHEN** a teacher navigates a deck by keyboard
- **THEN** horizontal and vertical sections are reachable in the order the source's headings define
- **AND** the overview mode, the progress indicator and the slide number remain available

#### Scenario: Stepwise reveal

- **WHEN** a source marks content as a fragment
- **THEN** that content is revealed step by step rather than with the slide

#### Scenario: Speaker notes

- **WHEN** a teacher opens the speaker view for a deck
- **THEN** the notes belonging to the current slide are shown there and not to the audience

#### Scenario: Export to PDF

- **WHEN** a deck is requested in the application's PDF export mode and printed
- **THEN** it is laid out for print at one page per slide
