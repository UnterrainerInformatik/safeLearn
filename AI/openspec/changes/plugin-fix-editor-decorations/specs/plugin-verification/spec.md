## ADDED Requirements

### Requirement: A run observes an error raised by the editor framework

Some defects surface as an error thrown inside the editor rather than as a wrong result on screen, and their visible effect is that nothing is marked at all. A check that reads only what was marked cannot distinguish that from a plugin that correctly marked nothing. A run SHALL therefore make errors raised while a document is opened, edited or scrolled available to a check, and SHALL attribute them to the document and the action that produced them.

#### Scenario: The editor rejects the plugin's markings

- **WHEN** the plugin hands the editor a set of markings the editor refuses, and consequently nothing is marked
- **THEN** the run reports the error that was raised, rather than an empty result that reads as "nothing needed marking"

#### Scenario: A document is opened without incident

- **WHEN** a document is opened and marked with no error raised
- **THEN** a check asserting that no error occurred can establish it, rather than inferring it from the absence of a report

### Requirement: A run can drive the editor without changing the document

Marking has to respond to a cursor move and to a scroll, and both are inputs that change no text. Typing cannot stand in for them, because it also changes the document and would therefore satisfy a defective implementation that only reacts to text changes. A run SHALL be able to move the cursor and to scroll the editor as distinct actions, and SHALL let a check read what was marked afterwards, with the document text demonstrably unchanged.

#### Scenario: The cursor is moved into a tag

- **WHEN** a check moves the cursor into a tag and reads the marking afterwards
- **THEN** no text was inserted or removed by that action

#### Scenario: A region is scrolled to for the first time

- **WHEN** a check scrolls to a part of the document that has not been visible in this session
- **THEN** it can read what is marked there without having edited the document to provoke it

## MODIFIED Requirements

### Requirement: The fixtures are this repository's corpus

The vault a run assembles SHALL be built from the Markdown corpus this repository ships, so that the tag forms the plugin is checked against are the tag forms the application actually renders. Fixtures maintained separately from the corpus SHALL NOT be the basis of a check, because the two would drift and the plugin would be verified against tags nobody writes.

Where a behavior depends on a *combination* of tag forms that no corpus file happens to carry, a check MAY construct a document in the run's own disposable vault. Such a document SHALL be built from tag forms the corpus already uses, SHALL be written where the check that relies on it can be read alongside it rather than in a separate fixture set, and SHALL NOT be written into the corpus. A constructed document SHALL NOT be used to check a tag form the corpus does not use at all: that is the case the rule above exists for, and the corpus is where it belongs.

#### Scenario: The corpus gains a tag form

- **WHEN** a file in the corpus starts using a tag form that was not present before
- **THEN** that form is part of what the next plugin run sees, without a fixture being written for it

#### Scenario: A behavior needs two tag forms in one document

- **WHEN** a check has to establish how one tag form affects the handling of another, and no corpus file places them together
- **THEN** it can assemble that document for the run from forms the corpus already uses, and the corpus is left as it is

#### Scenario: A run finishes after constructing a document

- **WHEN** a run that constructed a document has completed
- **THEN** nothing it constructed is present in the corpus, and the authenticated suite asserts against the same corpus as before
