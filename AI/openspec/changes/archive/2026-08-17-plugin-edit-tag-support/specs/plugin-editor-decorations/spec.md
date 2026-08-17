## ADDED Requirements

### Requirement: A permission directive is marked as the list of entries it is

A directive names a list, and the server reads it as one: the text after `@@@` is split into entries, and each entry is read on its own. The plugin SHALL mark the entries of a directive individually rather than marking the directive line as one indivisible thing, so that what is true of one entry is shown of that entry and not of its neighbours. An entry the server discards SHALL NOT be marked as an entry the server acts on.

#### Scenario: A directive names several things

- **WHEN** a directive names more than one entry
- **THEN** each entry carries its own marking, and an entry that differs from the others in kind is shown as differing

#### Scenario: An entry is written in a form the server discards

- **WHEN** a directive contains an entry the server refuses to read as an entry at all
- **THEN** that entry is not marked as one the server will act on, and the entries beside it are marked as they would be without it

### Requirement: A directive that governs the whole file is marked as doing so

A directive on the first line of a document gates the entire file and has no closing marker; every other directive gates the block between itself and its closing marker. These are different promises about different amounts of text, and the plugin SHALL mark the file-level form distinguishably from the block form. The marking SHALL convey that what is governed is the document rather than a region within it.

#### Scenario: The first line of a document is a directive

- **WHEN** a document begins with a directive
- **THEN** it is marked as governing the file, and is not marked as opening a block

#### Scenario: The same text stands on a later line

- **WHEN** the identical directive text appears on a line other than the first
- **THEN** it is marked as opening a block, which is what the server reads it as there

### Requirement: An entry carrying a time window is distinguishable from one that does not

An entry may carry a bracketed window that makes it take effect from a moment, until a moment, or between two. A block behind such an entry appears or disappears without anyone editing the document, which is a materially different thing from a permanent grant. The plugin SHALL mark an entry carrying a window distinguishably from an entry without one, and the distinction SHALL be visible without reading the timestamps.

Marking SHALL NOT depend on the current time. Whether a window is open at the moment of examination is not part of what is marked: recognition that changed with the clock would contradict the requirement that examining the same text twice gives the same answer, and would report a state that the document does not contain.

#### Scenario: A directive mixes timed and permanent entries

- **WHEN** a directive names one entry with a window and one without
- **THEN** the two are marked differently from one another

#### Scenario: A window has already closed

- **WHEN** a document carries a window whose end has passed
- **THEN** it is marked exactly as a window that has not yet opened, and no marking changes as time passes without the document being edited

### Requirement: A window the server discards is marked as discarded

The server parses a window and, failing, keeps the entry with no window at all — which makes it permanently active. An author who writes an unparseable window therefore grants access they meant to restrict, and nothing anywhere reports it. The plugin SHALL mark a window the server will discard distinguishably from one it will honour, and SHALL keep marking the entry itself as an entry, because that is what the server does with it.

#### Scenario: A window cannot be read as a time

- **WHEN** an entry carries a bracketed window the server cannot parse
- **THEN** the window is marked as one that will not take effect, and the entry beside it is still marked as an entry the server acts on

#### Scenario: Every entry of a directive is discarded

- **WHEN** a directive contains no entry the server can read
- **THEN** it is marked as one whose block will be withheld from every reader, which is what the server does with it

### Requirement: A view switch is distinguishable from an address

`#exam`, `#practice` and `#answer` are not roles. They are resolved against the reader's own stored preferences rather than against who the reader is, and they select between variants of a document instead of addressing anyone. The plugin SHALL mark them distinguishably from entries that name a role or a person, so that a directive selecting a variant is not read as one restricting an audience.

The server recognizes the prefix more broadly than it recognizes the three names: an entry carrying it is taken out of the role test whatever follows, and only these three then decide anything. An entry that carries the prefix but none of the three names therefore restricts nobody and switches nothing, and the plugin SHALL mark it as the switch that resolves to nothing rather than as either a working switch or an address.

#### Scenario: A directive names a view switch

- **WHEN** a directive names one of the three view switches
- **THEN** it is marked as a switch rather than as an address

#### Scenario: A directive names a class beside a view switch

- **WHEN** a directive names both a class and a view switch
- **THEN** the two are marked differently, and neither is marked as the other

#### Scenario: A switch names something the server does not resolve

- **WHEN** an entry carries the switch prefix followed by a name that is none of the three
- **THEN** it is marked as resolving to nothing, and is not marked as an address the server tests anyone against

## MODIFIED Requirements

### Requirement: A tag the plugin cannot resolve costs only itself

An unterminated block, a closing marker with no opening one, a directive form the plugin does not represent, and an unreadable entry within a directive SHALL each affect only their own line, block or entry. The marking of the rest of the document SHALL remain correct. A single malformed or unrecognized tag SHALL NOT suppress or displace the marking of anything after it, and an entry the plugin cannot resolve SHALL NOT cost the other entries of its own directive their marking.

#### Scenario: A block is never closed

- **WHEN** a document opens a block and reaches its end without closing it
- **THEN** the tags after the opening are marked as they would be in a document without it

#### Scenario: A closing marker appears with nothing open

- **WHEN** a closing marker stands in the document with no matching opening one
- **THEN** it does not turn the text that follows into a block

#### Scenario: A file-level directive stands on the first line

- **WHEN** the first line of a document is a directive that gates the whole file and therefore has no closing marker
- **THEN** it does not open a block, and every tag later in that document is marked

#### Scenario: One entry of a directive is unreadable

- **WHEN** a directive contains an entry that cannot be resolved alongside entries that can
- **THEN** the resolvable entries are marked as they would be in a directive without it
