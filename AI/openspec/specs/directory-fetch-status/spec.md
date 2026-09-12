# directory-fetch-status Specification

## Purpose

Lets a teacher or admin ask the safeLearn server what state its school-directory data is in — whether a fetch of the directory is running and how far along it is, and what the data currently held was built from — so that a wait is visibly a wait rather than a silence, and stale or incomplete directory data can be recognized as such.

## Requirements

### Requirement: The directory's state is reportable without searching it

The system SHALL expose a status operation that reports the state of its directory data and of any directory fetch currently running, and SHALL answer it without transferring the directory's contents. Answering SHALL NOT start a directory fetch, and SHALL NOT depend on one completing.

#### Scenario: The status is asked for while nothing is running

- **WHEN** an authorized caller asks for the directory status and no fetch is running
- **THEN** the answer reports that no fetch is running, and describes the directory data currently held

#### Scenario: The status is asked for while a fetch is running

- **WHEN** an authorized caller asks for the directory status while a directory fetch is running
- **THEN** the answer reports that a fetch is running, together with its progress

#### Scenario: The status is asked for before any directory data exists

- **WHEN** an authorized caller asks for the directory status before any directory data has ever been fetched, and no fetch is running
- **THEN** the answer reports that no directory data is held, rather than failing

#### Scenario: Asking never triggers work

- **WHEN** the directory status is asked for, in any state
- **THEN** no directory fetch is started by the request, and the answer does not wait on one

### Requirement: A running fetch reports which phase it is in and how far along it is

The system SHALL report, for a running directory fetch, which phase of the fetch is under way and how much of that phase is done out of how much total, in a form from which a percentage can be derived. The phases SHALL be distinguishable from one another, so that a caller can tell a fetch that has restarted from one that is progressing.

#### Scenario: A fetch is retrieving the directory's entries

- **WHEN** the status is asked for while the fetch is retrieving directory entries
- **THEN** the answer names that phase and reports how many entries have been retrieved out of the total the directory reports

#### Scenario: A fetch is resolving what each entry holds

- **WHEN** the status is asked for while the fetch is resolving the roles/groups of the entries it retrieved
- **THEN** the answer names that phase and reports how many entries have been resolved out of how many there are

#### Scenario: A fetch has not yet determined its total

- **WHEN** the status is asked for while a fetch is running but the total it will work through is not yet known
- **THEN** the answer names the phase and reports the absence of a total, rather than reporting a total that is wrong or a progress figure derived from one

### Requirement: The report describes the held directory data without carrying it

The system SHALL report, for the directory data currently held: how many entries it holds, when it was completed, and how many records were skipped while building it. It SHALL NOT include the entries themselves, and SHALL NOT disclose more about any skipped record than a directory search already discloses about that person.

#### Scenario: Data built from a completed fetch is held

- **WHEN** the status is asked for while completed directory data is held
- **THEN** the answer reports its entry count, when it was completed, and how many records were skipped, and does not include the entries

#### Scenario: Records were skipped while the data was built

- **WHEN** the held directory data was built while one or more records could not be retrieved
- **THEN** the answer reports how many were skipped, and discloses nothing about any of them that a directory search would not disclose

### Requirement: Only a teacher or admin identity may read the status

The system SHALL require the caller to present proof of a currently valid teacher or admin identity before answering the status operation, verified the same way and at the same moment a directory search verifies it. A caller holding neither role SHALL be refused, and the refusal SHALL be indistinguishable in effect from any other unauthorized request — it SHALL NOT report a partial or empty state that could be mistaken for a valid answer.

#### Scenario: A teacher or admin asks for the status

- **WHEN** a caller holding a currently valid teacher or admin identity asks for the directory status
- **THEN** the status is answered

#### Scenario: A caller holding neither role asks for the status

- **WHEN** a caller holding neither the teacher nor the admin role asks for the directory status
- **THEN** the request is refused the same way an unauthorized directory search is, and nothing about the directory's state is disclosed

#### Scenario: No proof of identity is presented

- **WHEN** the directory status is asked for without proof of a currently valid identity
- **THEN** the request is refused, indistinguishably from a caller holding neither role
