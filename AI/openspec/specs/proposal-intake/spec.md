# proposal-intake Specification

## Purpose

Defines how bug reports and ideas enter the OpenSpec workflow: they are collected as entries in `AI/open-proposals.md`, surfaced automatically whenever the user asks what there is to do, stay traceable to the change they produce, and are retired once that change is archived.

## Requirements

### Requirement: The backlog is surfaced at session start

When a Claude Code session starts in this repository, the assistant SHALL be told, without being asked, which entries are currently waiting in `AI/open-proposals.md`, and SHALL offer them to the user as a next step.

#### Scenario: Entries are waiting

- **WHEN** a session starts and `AI/open-proposals.md` holds one or more entries
- **THEN** the assistant receives, as part of its starting context, the full list of entries
- **AND** the assistant offers turning one of them into an OpenSpec change as the next step, before starting other work

#### Scenario: No entries are waiting

- **WHEN** a session starts and `AI/open-proposals.md` is missing, or holds no entries beyond its headings and placeholder text
- **THEN** no backlog-related context is produced and nothing is offered to the user
- **AND** the session start produces no error and no visible output from the check

#### Scenario: The check runs once per session

- **WHEN** a session has already received the list at its start
- **THEN** the list is not produced again for the remainder of that session, including after the context is cleared or compacted

#### Scenario: The check never blocks the session

- **WHEN** the check fails for any reason — unreadable file, missing interpreter, non-zero exit
- **THEN** the session starts normally and the failure does not surface as an error to the user

### Requirement: The backlog is checked whenever the user asks what there is to do

Not only at session start: whenever the user asks a question in the spirit of "what is there to do", the assistant SHALL check `AI/open-proposals.md` for waiting entries before answering, in addition to any other source of pending work.

#### Scenario: The user asks what there is to do

- **WHEN** the user asks a question of that kind, in this or a later session
- **THEN** the assistant reads `AI/open-proposals.md` before answering, and offers any entry found there alongside other pending work

### Requirement: A new bug report or idea is added as an entry

Where a bug report or idea comes up — in conversation or otherwise — and is not acted on right away, it SHALL be added to `AI/open-proposals.md` as an entry, under the "Bugs" or "Ideas" section as fits, rather than left to be recalled from the conversation alone.

#### Scenario: A bug is reported and not fixed immediately

- **WHEN** the user reports a bug and it is not resolved in the same turn
- **THEN** it is recorded as an entry in `AI/open-proposals.md`, with enough detail (what was reported, what has been established so far, what remains blocked or undecided) that work can resume from the entry alone

### Requirement: A change records the entry it came from

A change created from an entry in `AI/open-proposals.md` SHALL carry a machine- and human-readable link back to that entry, so that archiving can retire the right one.

#### Scenario: Change is created from a backlog entry

- **WHEN** an OpenSpec change is created from an entry in `AI/open-proposals.md`
- **THEN** the change's `proposal.md` states the source in the form `Source: AI/open-proposals.md`, naming the entry it came from

#### Scenario: Change has no backlog entry behind it

- **WHEN** a change was created directly from a conversation without first passing through `AI/open-proposals.md`
- **THEN** it carries no `Source:` line, and archiving it retires no entry

### Requirement: Archiving retires the source entry

When a change that came from `AI/open-proposals.md` is archived, its source entry SHALL be removed from the file, so the request is never offered again. The entry SHALL be deleted outright rather than moved: `AI/open-proposals.md` is fully tracked in git, so its history already preserves the original wording.

#### Scenario: Archiving a change with a source entry

- **WHEN** a change carrying a `Source:` line is archived successfully
- **THEN** the named entry is deleted from `AI/open-proposals.md`
- **AND** the next session start no longer lists it

#### Scenario: The source entry is already gone

- **WHEN** a change carrying a `Source:` line is archived but the named entry is no longer in `AI/open-proposals.md`
- **THEN** archiving completes normally and reports that no entry had to be retired

#### Scenario: Archiving is reported

- **WHEN** a source entry is retired during archiving
- **THEN** the archive summary states which entry was removed
