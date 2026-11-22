## ADDED Requirements

### Requirement: Nested blocks are framed per level

The plugin SHALL draw a frame for every block at every nesting level, each covering exactly the lines of its own block, with an inner frame inside the frame of its enclosing block. Adjacent nesting levels SHALL be distinguishable at a glance: the shading of a block's frame SHALL alternate between two shades from one level to the next, so that a block and the block directly inside it never carry the same shade. Each frame SHALL otherwise satisfy every requirement on a block's frame, heading and closing marker.

#### Scenario: Two levels

- **WHEN** a `@@@ 4bhif` block contains a nested `@@@ Rene Wildberger` block
- **THEN** two frames are drawn, the inner one inside the outer one, in different shades

#### Scenario: Three levels

- **WHEN** blocks are nested three deep
- **THEN** the first and second levels carry different shades, and the second and third carry different shades

#### Scenario: Blocks side by side inside one block

- **WHEN** a block contains two nested blocks one after the other
- **THEN** both nested blocks carry the same shade, different from their enclosing block

### Requirement: A block that is not closed is marked as open

A block with no closing line of its own runs to the end of the document and hides everything after it from the readers it does not admit. The plugin SHALL mark such a block, at any nesting level, with a warning marking (yellow) from its directive line down to the end of the document, distinguishable from the frame of a closed block, and SHALL keep the marking up to date while the person writes, so that it disappears as soon as the block's closing line is written.

#### Scenario: A forgotten inner closing line

- **WHEN** a `@@@ 4bhif` block contains a nested `@@@ #optional` block, and only one closing line follows both
- **THEN** the outer block is marked as open from its directive line to the end of the document, and the inner block is framed as closed

#### Scenario: The closing line is written

- **WHEN** the missing closing line is typed
- **THEN** the open marking is gone and both blocks are framed as closed
