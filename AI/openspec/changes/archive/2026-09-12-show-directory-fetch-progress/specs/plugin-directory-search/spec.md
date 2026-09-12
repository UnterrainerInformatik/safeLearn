## ADDED Requirements

### Requirement: A directory fetch in progress is shown wherever the plugin waits for the directory

The system SHALL, wherever it waits for an answer from the directory and the server reports that it is fetching the directory, show that a fetch is under way together with how far along it is, rather than showing nothing. It SHALL keep that indication current while the wait lasts, and SHALL show the result once the fetch completes without the person having to invoke anything again. A fetch in progress SHALL NOT be shown as a failure, as an unreachable instance, or as an empty result.

#### Scenario: A picker is opened while the server is fetching

- **WHEN** a picker is opened and the server reports a directory fetch in progress
- **THEN** the picker shows that the directory is being fetched and how far along it is, instead of an empty list with no explanation

#### Scenario: The indication follows the fetch

- **WHEN** a fetch in progress is being shown and the fetch advances
- **THEN** what is shown advances with it, rather than staying at the figure first shown

#### Scenario: The fetch completes while the person is waiting

- **WHEN** a fetch that was being shown completes
- **THEN** what was waiting on it is shown — the picker becomes usable, or the invoked command produces its result — without the person invoking anything again

#### Scenario: "List classes" is invoked while the server is fetching

- **WHEN** the "list classes" command is invoked and the server reports a directory fetch in progress
- **THEN** the fetch and its progress are shown, and the class list follows once the fetch completes

#### Scenario: A fetch in progress is not a failure

- **WHEN** the server reports a directory fetch in progress
- **THEN** nothing shown states or implies that the directory could not be reached, that the search failed, or that the directory holds nothing

## MODIFIED Requirements

### Requirement: Whether the directory can be reached is shown before a search is tried

The system SHALL, when a picker is opened with a login held, show whether the directory can currently be reached without waiting for a person to run a search first. An instance that cannot be reached at all, a search request that reached the instance but failed there, and an instance that was reached but whose directory data is still being fetched, SHALL each be shown as what they are, distinguishable from each other and from a query that legitimately matched nothing. This SHALL NOT widen what `plugin-login-state` deliberately keeps indistinguishable: a request refused for want of a valid identity and one refused for want of the teacher/admin role SHALL remain shown identically to being logged out.

#### Scenario: The directory is reachable

- **WHEN** a picker is opened, the directory can be reached, and its data is available
- **THEN** nothing is shown about connectivity, and the picker is usable immediately

#### Scenario: The instance cannot be reached

- **WHEN** a picker is opened and the configured instance cannot be reached at all
- **THEN** this is shown before a query is typed, distinguishable from a query that matched nothing

#### Scenario: A search request fails at the server

- **WHEN** a query is run and the request reaches the instance but the search itself fails there
- **THEN** this is shown as what it is, distinguishable both from an empty match and from the instance being unreachable

#### Scenario: The instance is reachable but still fetching its directory

- **WHEN** a picker is opened, the instance can be reached, and it reports that it is still fetching the directory
- **THEN** this is shown as what it is, distinguishable from the instance being unreachable, from a failed search, and from a query that matched nothing

#### Scenario: A request is refused for identity or role

- **WHEN** a directory request is refused for want of a valid identity or the teacher/admin role
- **THEN** nothing shown distinguishes this from being logged out, unchanged from `plugin-login-state`'s existing boundary
