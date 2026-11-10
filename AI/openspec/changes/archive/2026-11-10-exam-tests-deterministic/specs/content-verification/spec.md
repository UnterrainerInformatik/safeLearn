## MODIFIED Requirements

### Requirement: The corpus in `md/` is what gets verified

The files under `md/` demonstrate SafeLearn's behavior and are read before every commit by hand. Each behavior a corpus file demonstrates SHALL be covered by a check, so that reading the corpus by hand becomes a choice rather than the only way to find a regression. The corpus SHALL remain readable as documentation: checks read it, and SHALL NOT rewrite a demonstration into a form that only a machine benefits from. Every file under `md/`, assets included, SHALL be part of the repository: no file there SHALL be excluded from version control, so that every checkout verifies the same corpus.

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

#### Scenario: A corpus file the repository ignores

- **WHEN** a file under `md/` exists in the working tree but is excluded from version control by an ignore rule
- **THEN** a verification run fails, naming the file
- **AND** the run does so without a browser or a login, so the author who has the file finds out before committing
