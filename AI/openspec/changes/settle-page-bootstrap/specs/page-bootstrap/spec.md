## Purpose

Defines how a rendered SafeLearn page comes up in the browser: the period during which it is deliberately not shown, which script ends that period, that the period cannot last forever, and the live connection a page holds to the server while it is open. `presentation-view` governs what a deck is built from and what it may contact; this capability governs how any of the three views becomes visible and what it keeps open once it is.

## ADDED Requirements

### Requirement: A page is hidden until it is ready to be looked at

A rendered page SHALL NOT be shown before the state that decides its appearance has been applied — the session's display preferences, and any position restored after a hot reload. The hiding SHALL be effective from the first byte the browser renders, so it cannot depend on a stylesheet or a script having loaded.

#### Scenario: A page is opened with non-default preferences

- **WHEN** a session whose preferences differ from the defaults opens a page
- **THEN** the page is not shown in the default appearance at any point before it is shown in the session's own

#### Scenario: A page reloads after a corpus change

- **WHEN** a page reloads because the file behind it changed and a position had been saved
- **THEN** the page is not shown before that position has been restored

### Requirement: One script reveals a page, with one value

Each view SHALL have exactly one script that ends the hidden period, and that script SHALL be the only one writing the property that hides the page. No other script in that view SHALL set it, in either direction. The value written SHALL let the stylesheets decide the element's display rather than asserting one.

#### Scenario: A page is revealed

- **WHEN** a page has been revealed
- **THEN** the property that hid it carries the value that defers to the stylesheets, not a hardcoded display mode
- **AND** nothing sets it again for the life of the page

#### Scenario: A second script is added to a view

- **WHEN** a script is added to a view that already has an owner for the reveal
- **THEN** it does not write that property, whatever else it does

#### Scenario: A stylesheet gives the body a different display

- **WHEN** a stylesheet sets a display mode on the page's body element
- **THEN** the revealed page uses it, because the revealing script did not overwrite it

### Requirement: The hidden period is bounded

A page SHALL become visible even when whatever the reveal waits for never arrives. The bound SHALL be armed when the page starts and SHALL log why it fired, so that a page shown in a default state is distinguishable from one shown normally.

#### Scenario: The preference request never returns

- **WHEN** the request a view's reveal waits on does not answer
- **THEN** the page is shown anyway within the bound
- **AND** the reason is recorded where a developer looking at the page can find it

#### Scenario: The page comes up normally

- **WHEN** everything the reveal waits on arrives
- **THEN** the bound does not fire and nothing is logged

### Requirement: The three views follow the same rule

The page view, the document view and the presentation view SHALL each hide until ready, reveal exactly once, and bound the wait. Where a view's owner differs — because it loads different scripts and waits on different things — the difference SHALL be a stated decision rather than a consequence of which scripts a wrapper happens to emit.

#### Scenario: The same page is opened in each view

- **WHEN** a corpus file is opened as a page, as a document and as a deck
- **THEN** each becomes visible exactly once, by its view's own owner
- **AND** no view is revealed by a script belonging to another view's mechanism

### Requirement: A page's live connection is opened once and released with the page

A page SHALL hold at most one connection to the reload stream at a time. When the page is put aside rather than torn down — a back/forward-cache restore being the case that matters — the connection SHALL be released and re-established rather than retained. A failed connection SHALL be retried with an increasing delay, and a retry SHALL NOT accumulate handlers, timers or connections.

#### Scenario: A session walks through several pages in one tab

- **WHEN** a session opens one page after another in the same tab, including navigating back
- **THEN** the number of connections that session holds to the application does not grow with the number of pages visited

#### Scenario: The server is unavailable

- **WHEN** the application cannot be reached and a page retries its connection repeatedly
- **THEN** the delay between attempts increases rather than staying fixed
- **AND** each attempt leaves behind no more state than the one before it

#### Scenario: The connection serves a deployment without file watching

- **WHEN** a deployment runs with automatic rescanning switched off
- **THEN** pages still hold the connection, because permission windows opening and closing are announced over it
