# proposal-intake Specification

## Purpose

Defines how hand-written change requests dropped into `AI/proposals/` enter the OpenSpec workflow: they are surfaced automatically at session start, stay traceable to the change they produce, and are retired into the change archive once that change is archived.

## Requirements

### Requirement: Open proposals are surfaced at session start

When a Claude Code session starts in this repository, the assistant SHALL be told, without being asked, which Markdown files are currently waiting in `AI/proposals/`, and SHALL offer them to the user as a next step.

#### Scenario: Proposals are waiting

- **WHEN** a session starts and `AI/proposals/` contains one or more `.md` files
- **THEN** the assistant receives, as part of its starting context, the name of every such file
- **AND** the assistant offers turning one of them into an OpenSpec change as the next step, before starting other work

#### Scenario: No proposals are waiting

- **WHEN** a session starts and `AI/proposals/` contains no `.md` files, or the directory does not exist
- **THEN** no proposal-related context is produced and nothing is offered to the user
- **AND** the session start produces no error and no visible output from the check

#### Scenario: The check runs once per session

- **WHEN** a session has already received the list at its start
- **THEN** the list is not produced again for the remainder of that session, including after the context is cleared or compacted

#### Scenario: The check never blocks the session

- **WHEN** the check fails for any reason — unreadable directory, missing interpreter, non-zero exit
- **THEN** the session starts normally and the failure does not surface as an error to the user

### Requirement: A change records the proposal file it came from

A change created from a file in `AI/proposals/` SHALL carry a machine- and human-readable link back to that file, so that archiving can retire the right one.

#### Scenario: Change is created from a proposal file

- **WHEN** an OpenSpec change is created from a file in `AI/proposals/`
- **THEN** the change is named after that file's basename, without the `.md` extension
- **AND** the change's `proposal.md` states the source path in the form `Source proposal: AI/proposals/<file>.md`

#### Scenario: Change name and file name diverge

- **WHEN** a change's name does not match any file in `AI/proposals/`
- **THEN** the `Source proposal:` line in its `proposal.md` is the authoritative link

#### Scenario: Change has no proposal file behind it

- **WHEN** a change was created directly from a conversation rather than from a file in `AI/proposals/`
- **THEN** it carries no `Source proposal:` line, and archiving it retires no file

### Requirement: Archiving retires the source proposal file

When a change that came from `AI/proposals/` is archived, its source file SHALL leave `AI/proposals/` and SHALL be preserved with the archived change, so the request is never offered again while its original wording stays available.

#### Scenario: Archiving a change with a source proposal file

- **WHEN** a change carrying a `Source proposal:` line is archived successfully
- **THEN** the referenced file is moved out of `AI/proposals/` into the archived change's directory as `source-proposal.md`
- **AND** the file's content is preserved unchanged
- **AND** the next session start no longer lists it

#### Scenario: The source file is already gone

- **WHEN** a change carrying a `Source proposal:` line is archived but the referenced file no longer exists
- **THEN** archiving completes normally and reports that no file had to be retired

#### Scenario: Archiving is reported

- **WHEN** a source proposal file is retired during archiving
- **THEN** the archive summary states which file was moved and where it went
