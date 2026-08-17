## ADDED Requirements

### Requirement: The frame of a block covers every line of the block

A block's frame is what tells a person, while they write, that the text inside it is governed — restricted to named readers, or laid out as columns. The frame SHALL cover every line the block covers, whatever the editor renders that line as. Where the editor replaces one or more lines of a block with a rendered element of its own — a table, a callout, a diagram, a formula, an embedded note — the frame SHALL extend across that element as it does across a line of text.

The block's ends SHALL stay where the document puts them: the first line of the block closes the frame at the top and the last line closes it at the bottom, whether or not those lines are rendered as text.

The frame SHALL be one rectangle. Elements the editor renders in place of lines are not laid out to the same width as its line elements, and a frame whose edges follow each element's own width is not a boundary a person can read. The edges SHALL stand in one vertical line for the whole block.

This holds for both kinds of block the plugin draws — the permission block and the side-by-side block — because both make the same statement about the text between their markers.

#### Scenario: A table stands in the middle of a permission block

- **WHEN** a permission block contains a table between two lines of text
- **THEN** the frame runs unbroken from the block's first line to its last, the table is inside it, and the block's boundary is not readable as ending above the table or beginning below it

#### Scenario: A block contains nothing but a rendered element

- **WHEN** a permission block's only content between its markers is a table, a callout or another element the editor renders in place of lines
- **THEN** the block is drawn as one closed frame around it

#### Scenario: A side-by-side block contains a table

- **WHEN** a table stands inside a side-by-side block
- **THEN** the block's region covers it, exactly as it covers the lines of text around it

#### Scenario: The edges of the frame meet elements of differing width

- **WHEN** a block contains both ordinary lines and an element the editor lays out to a different width
- **THEN** the frame's edges stand in one vertical line over the whole block rather than following each element's own width

#### Scenario: Text outside a block is not framed

- **WHEN** a table, a callout or another rendered element stands outside every block
- **THEN** it carries no frame

### Requirement: A rendered element inside a block keeps its own appearance

The elements the editor renders in place of lines carry appearances of their own — a callout has its colour and its icon, a table has its borders, an embedded note has its frame. The plugin SHALL add the block's frame around such an element and SHALL NOT otherwise change how it is drawn.

#### Scenario: A callout inside a permission block

- **WHEN** a callout stands inside a permission block
- **THEN** it is drawn as Obsidian draws a callout, with the block's frame around it

### Requirement: The frame follows the document as the block changes

Which lines a block covers changes as a person writes, and the elements the editor renders in place of lines are built, rebuilt and discarded as that happens — some of them after the edit that caused them. Whatever the frame is applied to SHALL be brought up to date on the same occasions the rest of the marking is: an edit, a cursor move, a change of the visible region, and the arrival of an element the editor renders after the fact.

A block that no longer covers a line SHALL NOT leave a frame behind on it.

#### Scenario: A table is written into an existing block

- **WHEN** a table is typed into a permission block that did not contain one
- **THEN** the frame covers it, without the document having to be closed and reopened

#### Scenario: A block's closing marker is moved above a table

- **WHEN** a block that contained a table is closed above it, so that the table now stands outside the block
- **THEN** the table no longer carries the frame

#### Scenario: An element is rendered after the update that produced it

- **WHEN** the editor finishes building a rendered element — a diagram, an embedded note — after the update in which its lines entered the block
- **THEN** the frame covers it once it is there
