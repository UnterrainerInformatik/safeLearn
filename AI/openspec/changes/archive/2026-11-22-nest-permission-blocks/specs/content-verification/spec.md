## ADDED Requirements

### Requirement: The corpus has no unclosed inline block

A check SHALL read every Markdown file of the corpus and fail for each inline block, at any nesting level, that has no closing line of its own, by the grammar that decides block boundaries (`permission-block-grammar`). The failure SHALL name the file and the line of the block's directive. Because an unclosed block hides everything to the end of the document from everyone it does not admit, a forgotten closing line would otherwise only show as missing content.

#### Scenario: A forgotten inner closing line

- **WHEN** a file in `md/` holds a `@@@ 4bhif` block whose nested `@@@ #optional` block is closed by the only closing line that follows
- **THEN** the check fails and names that file and the line of `@@@ 4bhif`

#### Scenario: A marker line inside a code block

- **WHEN** a file in `md/` holds an unclosed `@@@ teacher` line only inside a closed fenced code block
- **THEN** the check does not fail for it
