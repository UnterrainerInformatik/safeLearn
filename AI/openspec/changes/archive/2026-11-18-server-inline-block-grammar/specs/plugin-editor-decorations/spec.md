## ADDED Requirements

### Requirement: Block boundaries follow the shared block grammar

The plugin SHALL find permission blocks by the grammar of `permission-block-grammar`, the same grammar the server applies. A marker line inside a closed fenced code block, using backticks or tildes, SHALL NOT be marked as a block's opening or closing line, and SHALL NOT be framed or hidden as a tag. A fence that is never closed SHALL NOT stop marker lines after it from being marked. `@@@` inside a line of running text SHALL NOT be marked as a marker.

#### Scenario: A syntax example in a code block

- **WHEN** a document contains a closed ```` ``` ```` fence whose lines are `@@@ teacher`, `secret`, `@@@`
- **THEN** the plugin draws no block frame and no directive heading for them, and shows the three lines as code

#### Scenario: A closing marker inside code within a block

- **WHEN** a `@@@ #exam` block contains a closed fence holding the line `@@@`, and the block closes on a `@@@` line after the fence
- **THEN** the frame of the block runs to that later line

#### Scenario: An unclosed fence

- **WHEN** a fence is opened and never closed, and a `@@@ #exam` block follows below it
- **THEN** the plugin marks the `@@@ #exam` block as a block
