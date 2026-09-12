## ADDED Requirements

### Requirement: A search that cannot be answered yet reports the fetch instead of waiting for it

The system SHALL, when a search cannot be answered because the directory's data is not yet available, answer immediately with an outcome meaning "not yet, this is how far along it is" carrying the running fetch's progress, rather than holding the request open until the data is ready. That outcome SHALL be distinguishable from a successful search, from a failed one, and from a search that legitimately matched nothing. This applies to every search, including the empty query that enumerates the whole directory.

If no directory data is available and no fetch is running, the request SHALL cause one to start, so that a caller repeating the request is not waiting on something that will never happen.

A caller repeating the same search SHALL eventually receive the result once the fetch completes, without having to change the request.

#### Scenario: A search arrives while a fetch is running

- **WHEN** an authorized caller searches while a directory fetch is running and no directory data is yet available
- **THEN** the search is answered immediately with the "not yet" outcome and the fetch's progress, and the request is not held open until the fetch finishes

#### Scenario: A search arrives with no data and no fetch running

- **WHEN** an authorized caller searches while no directory data is available and no fetch is running
- **THEN** a fetch is started, and the search is answered immediately with the "not yet" outcome rather than being held open

#### Scenario: The same search is repeated until the fetch completes

- **WHEN** an authorized caller repeats a search that was answered with "not yet", after the fetch has completed
- **THEN** the search is answered with its results

#### Scenario: Unavailable data is never reported as a failure

- **WHEN** a search cannot be answered because the directory's data is not yet available
- **THEN** the answer is the "not yet" outcome, not an error and not an empty result

#### Scenario: A search arrives while data is available

- **WHEN** an authorized caller searches while directory data is available
- **THEN** the search is answered with its results, unchanged by the existence of the "not yet" outcome

## MODIFIED Requirements

### Requirement: A single endpoint searches both names and roles

The system SHALL expose one search operation that matches a caller-supplied wildcard query against either a person's display name or any role/group that person holds. A role/group is any value the directory associates with a person the same way class membership, `teacher`, or `admin` are associated — the query SHALL NOT be restricted to a fixed set of role/group kinds, so a directory value such as an exam-participant marker is searchable the same way a class name is.

Matching describes what an answered search returns. A search the system cannot answer yet, because the directory's data is not available, is not a search that matched nothing — see "A search that cannot be answered yet reports the fetch instead of waiting for it".

#### Scenario: Query matches a display name

- **WHEN** the query is a substring of a person's display name, case-insensitively
- **THEN** that person is included in the result

#### Scenario: Query matches a role or group

- **WHEN** the query is a substring of a role or group value the directory associates with one or more people, case-insensitively
- **THEN** every person holding that role or group is included in the result

#### Scenario: Query matches nothing

- **WHEN** the query matches no display name and no role/group in the directory, and the directory's data is available
- **THEN** the result is an empty list, not an error

#### Scenario: The directory's data is not available

- **WHEN** a search is made and the directory's data is not available to match against
- **THEN** the answer reports that the data is not ready yet, distinguishable from a query that matched nothing
