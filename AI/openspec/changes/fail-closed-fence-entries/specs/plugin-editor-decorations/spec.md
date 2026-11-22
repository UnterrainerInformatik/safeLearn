## MODIFIED Requirements

### Requirement: A window the server discards is marked as discarded

The server parses a window and, failing in whole or in any part, keeps the entry as one that is closed at every moment: a role or person named through it is admitted by nothing, and a view marker carrying it can never be satisfied (`role-resolution`). An author who writes an unparseable window therefore withholds what they meant to show for a while, and would otherwise only notice it as missing content. The plugin SHALL mark a window the server will discard distinguishably from one it will honour, SHALL mark the entry carrying it as closed rather than as permanently active, and SHALL keep marking the entry itself as an entry, because the server keeps it.

#### Scenario: A window cannot be read as a time

- **WHEN** an entry carries a bracketed window the server cannot parse
- **THEN** the window is marked as one that will not take effect, and the entry beside it is marked as an entry that admits nobody

#### Scenario: Half of a window can be read

- **WHEN** an entry carries a window whose start is a valid time and whose end is not
- **THEN** it is marked exactly as a window the server cannot parse at all

#### Scenario: Every entry of a directive is discarded

- **WHEN** a directive contains no entry the server can read, or only entries whose windows it cannot read
- **THEN** it is marked as one whose block will be withheld from every reader, which is what the server does with it

## ADDED Requirements

### Requirement: A directive that names both variants is marked as withheld

The server combines the view markers of one directive with AND, so a directive naming both `#variant-private` and `#variant-public` hides its block from every reader (`role-resolution`). The plugin SHALL mark such a directive as one whose block will be withheld from every reader, with the same marking as an unknown view marker, whatever else the directive names and in whichever order the two are written. A directive combining `#optional` with one of the two variants SHALL be marked as working switches.

#### Scenario: Both variants in one directive

- **WHEN** a directive reads `@@@ #variant-public, 4ahif, #variant-private`
- **THEN** it is marked as withheld from every reader

#### Scenario: A variant combined with the optional switch

- **WHEN** a directive reads `@@@ #variant-private, #optional`
- **THEN** both entries are marked as working switches and neither as an error
