## ADDED Requirements

### Requirement: A directory fetch in progress is shown while the view waits

The system SHALL, while the view waits for its directory query and the server reports that it is fetching the directory, show that a fetch is under way together with how far along it is, keep that indication current while the wait lasts, and fill the view in once the fetch completes without the person having to reopen it.

#### Scenario: The view is opened while the server is fetching

- **WHEN** the view is opened and the server reports a directory fetch in progress
- **THEN** the view shows that the directory is being fetched and how far along it is, instead of empty sections with no explanation

#### Scenario: The fetch completes while the view is open

- **WHEN** a fetch the open view is waiting on completes
- **THEN** the view's sections fill in with the result, without the person reopening the view

#### Scenario: A fetch in progress is not a failure

- **WHEN** the view is waiting on a directory fetch in progress
- **THEN** nothing shown states or implies that the directory could not be reached or that the query failed

### Requirement: The state of the directory data behind the view is shown

The system SHALL show, as one section of the view, the state of the directory data the server holds: how many entries it holds, when it was built, how many records were skipped while building it, and whether a fetch is currently running. It SHALL show this in the same terms whether or not a fetch is running, so the person can tell fresh data from data that has been held for a long time.

#### Scenario: The view is opened with directory data held

- **WHEN** the view is opened and the server holds directory data
- **THEN** the view shows how many entries it holds, when it was built, and how many records were skipped

#### Scenario: Records were skipped while the data was built

- **WHEN** the directory data the view is showing was built with one or more records skipped
- **THEN** the view shows that records were skipped and how many, rather than presenting the data as complete

#### Scenario: The state cannot be determined

- **WHEN** the view is opened and the server's directory state cannot be determined
- **THEN** that section shows that the state is unknown, and the rest of the view is unaffected

### Requirement: The view is reachable from the plugin's settings

The system SHALL offer, in the plugin's settings, a way to open the directory info view, in addition to the command palette. It SHALL offer it under the same conditions the command is offered under: only while the held connection satisfies the teacher-or-admin check, and only while an instance is configured.

#### Scenario: The settings are opened while holding a qualifying role

- **WHEN** the plugin's settings are opened, an instance is configured, and the held connection holds the teacher or admin role
- **THEN** the settings offer a way to open the directory info view, and using it opens the same view the command palette opens

#### Scenario: The settings are opened without a qualifying role

- **WHEN** the plugin's settings are opened and the held connection holds neither the teacher nor the admin role, or no connection is held at all
- **THEN** the settings do not offer a way to open the directory info view

#### Scenario: No instance is configured

- **WHEN** the plugin's settings are opened and no instance is configured
- **THEN** nothing about the directory info view is shown, consistent with everything else that depends on a configured instance

### Requirement: The settings summarize the directory's state next to that entry point

The system SHALL show, in the plugin's settings alongside the way to open the view, a short summary of the directory's state — how many entries are held and how long ago they were built, or the progress of a fetch while one is running — so that the state is visible without opening the view at all.

#### Scenario: Directory data is held and no fetch is running

- **WHEN** the settings are opened while the server holds directory data and no fetch is running
- **THEN** the settings show how many entries are held and how long ago they were built

#### Scenario: A fetch is running

- **WHEN** the settings are opened while the server reports a directory fetch in progress
- **THEN** the settings show that a fetch is running and how far along it is

#### Scenario: The state cannot be determined

- **WHEN** the settings are opened and the server's directory state cannot be determined
- **THEN** the summary says so, and the way to open the view is still offered

## MODIFIED Requirements

### Requirement: A directory search failure is distinguishable from an empty result

The system SHALL show a directory search failure (the directory being unreachable, refusing the request, or failing server-side) as a failure, distinct from a query that legitimately found nothing and distinct from a fetch that is still in progress.

#### Scenario: The directory cannot be reached or refuses the request

- **WHEN** any section's directory query does not complete with an `ok` outcome, and the server is not reporting a fetch in progress
- **THEN** that section shows that the query failed, not an empty list

#### Scenario: The server reports a fetch in progress

- **WHEN** any section's directory query does not complete with an `ok` outcome because the server reports that it is still fetching the directory
- **THEN** that section shows the fetch and its progress, not a failure

### Requirement: The total user count and class count are shown up front

The system SHALL show, as soon as the directory query completes with an `ok` outcome, the total number of users and the total number of classes the directory reported, without requiring the person to scroll or search any list to find those totals.

#### Scenario: The directory query succeeds

- **WHEN** the view's directory query completes with an `ok` outcome
- **THEN** the total number of users and the total number of classes the directory reported are both shown, visible without scrolling any list

#### Scenario: The directory query does not succeed

- **WHEN** the view's directory query does not complete with an `ok` outcome and the server is not reporting a fetch in progress
- **THEN** no user/class totals are shown, and the existing failure indication is what the person sees instead

#### Scenario: The query is still waiting on a fetch

- **WHEN** the view's directory query has not completed because the server is still fetching the directory
- **THEN** no user/class totals are shown yet, the fetch's progress is what the person sees instead, and the totals appear once the fetch completes
