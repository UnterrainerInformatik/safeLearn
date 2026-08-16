## Purpose

Defines the in-memory index SafeLearn builds over the Markdown corpus in `md/`: what a scan puts in it, when an entry is read from disk again, and — because the index is what the navigation tree is built from — the rule that a file's whole-file permission directive is interpreted by one implementation no matter which part of the application is asking. `role-resolution` governs which roles a session holds and how a directive is evaluated against them; this capability governs where that evaluation is reached from and what it is given to work with.

## ADDED Requirements

### Requirement: A scan reads from disk only what changed

A scan of the corpus SHALL read a file's contents only when that file is new to the index or its modification time differs from the one recorded for it. For every other file the scan SHALL carry the previously derived metadata forward. Rebuilding the index SHALL NOT require opening files whose modification time says they are unchanged.

#### Scenario: One file of many is edited

- **WHEN** a single file in the corpus is changed and a scan follows
- **THEN** that file is read
- **AND** no unchanged file is opened by the scan

#### Scenario: The first scan after startup

- **WHEN** the application scans a corpus it holds no previous record of
- **THEN** every file is read, because none of them can be carried forward

#### Scenario: A file is removed

- **WHEN** a file that the index held is deleted and a scan follows
- **THEN** the index no longer holds an entry for it
- **AND** nothing carried forward keeps the removed file's metadata reachable

### Requirement: One implementation decides whether a session may see a file

Whether a session may see a file addressed by a whole-file permission directive SHALL be decided by a single implementation, called by every part of the application that needs the answer. No caller SHALL restate the rule — which roles a directive's time windows make active, that a directive with no active role hides the file from everyone, and how the resulting roles are tested against the session.

#### Scenario: The tree and the page agree

- **WHEN** a session is shown the navigation tree and then opens a file it lists
- **THEN** the file renders, rather than answering with a refusal
- **AND** for a file the tree does not list, opening it directly is refused

#### Scenario: The rule is changed

- **WHEN** the way a directive's active roles are determined is changed
- **THEN** the change takes effect for the navigation tree and for the rendered page together, because both reach the same implementation

#### Scenario: A directive is absent

- **WHEN** a file carries no whole-file directive
- **THEN** every authenticated session may see it, and it is listed for every session

### Requirement: Content with no index entry is governed by the directive it carries

The application SHALL apply the whole-file rule to Markdown it renders from a request body or from a fetched URL, neither of which corresponds to a file in the corpus. The shared implementation SHALL therefore operate on a directive that the caller has already parsed, not on a path it resolves for itself.

#### Scenario: Markdown is posted for conversion

- **WHEN** a session posts Markdown whose first line is a directive naming roles the session does not hold
- **THEN** the conversion is refused, exactly as the rendered page would be

#### Scenario: The index is not consulted for a page

- **WHEN** a file's directive is edited and a session requests that file before any scan has run
- **THEN** the response reflects the directive as it now stands on disk, not the one the index recorded

### Requirement: The index is a snapshot, and says so

The index SHALL be understood as the state of the corpus at the last scan. Where the application shows a session what exists — the navigation tree — it MAY answer from the index. Where the application decides whether to hand over content, it SHALL read the file. A deployment that has automatic rescanning switched off SHALL therefore show a navigation tree that can be older than the corpus, without that staleness ever granting access.

#### Scenario: A directive is tightened between scans

- **WHEN** a file that was visible to everyone is given a directive naming a role the session lacks, and no scan has run since
- **THEN** the file may still appear in that session's navigation tree
- **AND** opening it is refused

#### Scenario: A directive is relaxed between scans

- **WHEN** a directive is removed from a file and no scan has run since
- **THEN** a session that could not see it before may open it directly and receive it
