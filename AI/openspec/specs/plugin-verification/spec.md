# plugin-verification Specification

## Purpose

Defines how the companion Obsidian plugin is made observable: that a verification run drives a real Obsidian against a vault built for the run, that it can reach each of the states the plugin behaves differently in, and that it reports what the plugin actually did to a document rather than what its source suggests it should. The plugin's defects only appear while a person types, so the harness exists to let them be watched instead of argued about.

## Requirements

### Requirement: The plugin is observed in a real Obsidian

A verification run SHALL drive the Obsidian application itself, with the plugin loaded as Obsidian loads it. A substitute editor, a mocked plugin API or a rendered copy of the markup SHALL NOT be reported as a verified result: the behavior under test is what Obsidian does with the plugin's decorations, and a substitute cannot produce it.

#### Scenario: A check asserts on decorated text

- **WHEN** a check reads what the editor shows for a document containing SafeLearn tags
- **THEN** what it reads came from a running Obsidian with the plugin active

#### Scenario: Obsidian cannot be reached

- **WHEN** the application cannot be started or the run cannot attach to it
- **THEN** the run fails naming what it looked for and where, rather than timing out or reporting an empty result as a pass

### Requirement: A run tests the build that exists now

The plugin's loadable artifact is produced from its sources and is not committed. A run SHALL build the plugin from the checkout it is pointed at before loading it, and SHALL fail rather than fall back to an artifact left over from an earlier build.

#### Scenario: The sources changed since the last run

- **WHEN** a run starts after the plugin's sources were edited
- **THEN** what Obsidian loads was built from those edits

#### Scenario: The build fails

- **WHEN** the plugin does not build
- **THEN** the run reports the build failure and does not load a previous artifact instead

### Requirement: A run does not disturb a vault in use

The working repository is itself a usable Obsidian vault with the plugin linked into it. A run SHALL assemble its own vault for the purpose and SHALL NOT write to the state of a vault a person works in — neither its workspace, nor its plugin list, nor its settings.

#### Scenario: A run finishes

- **WHEN** a verification run has completed, whether it passed or failed
- **THEN** the vault a person opens by hand is in the state they left it in

#### Scenario: A run is repeated

- **WHEN** a run starts while artifacts of an earlier run are still present
- **THEN** it works from a vault whose contents it established, so that an earlier run cannot decide a later one's result

### Requirement: The fixtures are this repository's corpus

The vault a run assembles SHALL be built from the Markdown corpus this repository ships, so that the tag forms the plugin is checked against are the tag forms the application actually renders. Fixtures maintained separately from the corpus SHALL NOT be the basis of a check, because the two would drift and the plugin would be verified against tags nobody writes.

#### Scenario: The corpus gains a tag form

- **WHEN** a file in the corpus starts using a tag form that was not present before
- **THEN** that form is part of what the next plugin run sees, without a fixture being written for it

### Requirement: Each state the plugin behaves differently in is reachable

The plugin decorates live text in one mechanism and rewrites rendered output in another, and Obsidian shows a document in more than one state. A run SHALL be able to put a document into each of those states and SHALL let a check state which one it is asserting about, so that a defect in one is not hidden by correct behavior in another.

#### Scenario: A check targets the reading view

- **WHEN** a check asserts that a tag is hidden from a reader
- **THEN** it can reach that state explicitly, and a pass in another state does not satisfy it

#### Scenario: A check targets the editor while typing

- **WHEN** a check asserts on how a decoration follows an edit
- **THEN** it can put text into the document the way a person would and read the result afterwards

### Requirement: A run reports what the plugin did to the document

The harness SHALL hand a check the observable outcome — the text as shown, and the markers the plugin itself applies — rather than requiring a check to read the plugin's internal state. A check SHALL be expressible against what a person would see.

#### Scenario: A decoration covers the wrong range

- **WHEN** a decoration extends beyond the token it belongs to
- **THEN** a check can observe that from what the editor shows, and the failure names the position

### Requirement: A failing run leaves something to look at

A run SHALL record an image of what it saw at the point of failure, in the location the existing harness already uses for its own run artifacts. A failure of a visual behavior that leaves only an assertion message SHALL be treated as insufficient.

#### Scenario: A check fails

- **WHEN** an assertion about the plugin's visible behavior fails
- **THEN** an image of the state that produced it is written where it can be opened afterwards

### Requirement: The plugin run is separate from the authenticated run

The run that verifies the plugin SHALL be a command of its own, and SHALL NOT be joined to the run that starts the server and authenticates against the shared demo realm. Neither run's cost or failures SHALL be imposed on the other.

#### Scenario: A plugin source is edited

- **WHEN** the plugin is changed and its verification is run
- **THEN** no login against the identity provider takes place and no application server is started

#### Scenario: The server suite is run

- **WHEN** the existing verification run is started
- **THEN** it neither builds the plugin nor requires Obsidian to be installed

### Requirement: What is machine-specific is configuration

The location of the Obsidian application and of the plugin checkout differ per installation. A run SHALL read them from configuration with defaults, in the form the existing harness already uses, and SHALL report a missing one by naming it.

#### Scenario: The plugin checkout is elsewhere

- **WHEN** a run is started on an installation where the plugin repository sits at a different path
- **THEN** the path can be supplied without editing a check, and the run uses it

#### Scenario: Obsidian is not installed

- **WHEN** a run is started where the application cannot be found
- **THEN** the failure says that it was not found and where it was expected, and does not present itself as a plugin defect
