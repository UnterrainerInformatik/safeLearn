## MODIFIED Requirements

### Requirement: A view switch is distinguishable from an address

`#variant-private`, `#variant-public` and `#optional` are not roles. They are resolved against the reader's own stored preferences rather than against who the reader is, and they select between variants of a document instead of addressing anyone. The plugin SHALL mark them distinguishably from entries that name a role or a person, so that a directive selecting a variant is not read as one restricting an audience.

The server recognizes the prefix more broadly than it recognizes the three names: an entry carrying it is taken out of the role test whatever follows, and an entry that carries the prefix but none of the three names hides its block from every reader (`role-resolution`). The old names `#exam`, `#practice` and `#answer` are among those unknown names. The plugin SHALL mark such an entry as an error that hides the block from everyone, distinguishable from both a working switch and an address, so that the author sees it while writing rather than as missing content after publishing.

#### Scenario: A directive names a view switch

- **WHEN** a directive names one of the three view switches
- **THEN** it is marked as a switch rather than as an address

#### Scenario: A directive names a class beside a view switch

- **WHEN** a directive names both a class and a view switch
- **THEN** the two are marked differently, and neither is marked as the other

#### Scenario: A switch names something the server does not resolve

- **WHEN** an entry carries the switch prefix followed by a name that is none of the three
- **THEN** it is marked as an error that hides the block from everyone, and is not marked as an address the server tests anyone against

#### Scenario: A retired name

- **WHEN** a directive names `#exam`
- **THEN** it is marked as that error, not as a working switch


### Requirement: Block boundaries follow the shared block grammar

The plugin SHALL find permission blocks by the grammar of `permission-block-grammar`, the same grammar the server applies. A marker line inside a closed fenced code block, using backticks or tildes, SHALL NOT be marked as a block's opening or closing line, and SHALL NOT be framed or hidden as a tag. A fence that is never closed SHALL NOT stop marker lines after it from being marked. `@@@` inside a line of running text SHALL NOT be marked as a marker.

#### Scenario: A syntax example in a code block

- **WHEN** a document contains a closed ```` ``` ```` fence whose lines are `@@@ teacher`, `secret`, `@@@`
- **THEN** the plugin draws no block frame and no directive heading for them, and shows the three lines as code

#### Scenario: A closing marker inside code within a block

- **WHEN** a `@@@ #variant-private` block contains a closed fence holding the line `@@@`, and the block closes on a `@@@` line after the fence
- **THEN** the frame of the block runs to that later line

#### Scenario: An unclosed fence

- **WHEN** a fence is opened and never closed, and a `@@@ #variant-private` block follows below it
- **THEN** the plugin marks the `@@@ #variant-private` block as a block
