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

### Requirement: Each state the plugin behaves differently in is reachable

The plugin decorates live text in one mechanism and rewrites rendered output in another, and Obsidian shows a document in more than one state. A run SHALL be able to put a document into each of those states and SHALL let a check state which one it is asserting about, so that a defect in one is not hidden by correct behavior in another.

#### Scenario: A check targets the reading view

- **WHEN** a check asserts that a tag is hidden from a reader
- **THEN** it can reach that state explicitly, and a pass in another state does not satisfy it

#### Scenario: A check targets the editor while typing

- **WHEN** a check asserts on how a decoration follows an edit
- **THEN** it can put text into the document the way a person would and read the result afterwards

### Requirement: A run can drive the editor without changing the document

Marking has to respond to a cursor move and to a scroll, and both are inputs that change no text. Typing cannot stand in for them, because it also changes the document and would therefore satisfy a defective implementation that only reacts to text changes. A run SHALL be able to move the cursor and to scroll the editor as distinct actions, and SHALL let a check read what was marked afterwards, with the document text demonstrably unchanged.

#### Scenario: The cursor is moved into a tag

- **WHEN** a check moves the cursor into a tag and reads the marking afterwards
- **THEN** no text was inserted or removed by that action

#### Scenario: A region is scrolled to for the first time

- **WHEN** a check scrolls to a part of the document that has not been visible in this session
- **THEN** it can read what is marked there without having edited the document to provoke it

### Requirement: A run reports what the plugin did to the document

The harness SHALL hand a check the observable outcome — the text as shown, and the markers the plugin itself applies — rather than requiring a check to read the plugin's internal state. A check SHALL be expressible against what a person would see.

#### Scenario: A decoration covers the wrong range

- **WHEN** a decoration extends beyond the token it belongs to
- **THEN** a check can observe that from what the editor shows, and the failure names the position

### Requirement: A run observes an error raised by the editor framework

Some defects surface as an error thrown inside the editor rather than as a wrong result on screen, and their visible effect is that nothing is marked at all. A check that reads only what was marked cannot distinguish that from a plugin that correctly marked nothing. A run SHALL therefore make errors raised while a document is opened, edited or scrolled available to a check, and SHALL attribute them to the document and the action that produced them.

#### Scenario: The editor rejects the plugin's markings

- **WHEN** the plugin hands the editor a set of markings the editor refuses, and consequently nothing is marked
- **THEN** the run reports the error that was raised, rather than an empty result that reads as "nothing needed marking"

#### Scenario: A document is opened without incident

- **WHEN** a document is opened and marked with no error raised
- **THEN** a check asserting that no error occurred can establish it, rather than inferring it from the absence of a report

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

### Requirement: Pointing a vault at a plugin checkout is written down for each platform

A working vault loads the plugin from a checkout rather than from an installed copy, and how that link is made differs per platform. The repository SHALL document the procedure for each platform it is developed on, as commands that can be followed rather than as a description of the result. The documentation SHALL name what must be true of the checkout before the link means anything — that its dependencies are installed and that it has been built at least once, `main.js` not being committed.

The documentation SHALL also say who the procedure is not for: a person who uses the plugin installs it from Obsidian's community browser, and SHALL NOT be directed through a development setup to do so.

#### Scenario: A person sets up a vault to work on the plugin

- **WHEN** somebody working on the plugin wants a vault that loads what was last built
- **THEN** the repository gives them the command for their platform, and what it should produce

#### Scenario: A person only wants to use the plugin

- **WHEN** somebody who does not work on the plugin looks for how to install it
- **THEN** what they are told is to install it from the community browser, and the development procedure is marked as not being for them

### Requirement: The documented procedure protects the checkout from the vault's own repository

Where a vault is itself a repository that tracks its plugin directory, the documented procedure SHALL have that directory untracked and ignored before the link is made, and SHALL state why. The reason SHALL be given as the consequence it prevents rather than as a rule alone, so that the step is not read as tidiness and dropped.

What it prevents is this: git follows a link as if it were an ordinary directory, so an ordinary `git checkout` or `git pull` in such a vault writes through the link into the plugin's working tree, over files that are source there rather than build output.

#### Scenario: The vault is a git repository that tracks its plugins

- **WHEN** the procedure is followed in a vault whose plugin files are tracked
- **THEN** those files are untracked and the directory ignored before the link is made, and the guide has said what that prevents

#### Scenario: A pull happens in a linked vault afterwards

- **WHEN** the vault is updated from its remote after the procedure has been followed
- **THEN** nothing is written into the plugin checkout through the link
