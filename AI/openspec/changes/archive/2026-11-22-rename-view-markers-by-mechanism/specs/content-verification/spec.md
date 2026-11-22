## MODIFIED Requirements

### Requirement: The view pseudo-roles are proven against the preferences that drive them

The `#variant-private`, `#variant-public` and `#optional` directives are resolved from stored preferences and, for the private variant, from the teacher or admin role. A check SHALL set the preferences the outcome depends on before reading the page, and SHALL prove each variant both present and absent.

The private and public variants SHALL additionally be proven complementary: for every combination of role and preference a check reads, exactly one of the two SHALL be present. Proving each variant on its own leaves the combination that shows neither undetected, which is the combination that was shipped.

#### Scenario: Exam and practice are mutually exclusive

- **WHEN** a teacher session sets the private-variant view and loads the variant page
- **THEN** the private variant of the question is present and the public variant is absent
- **AND** with the private-variant view cleared, the public variant is present and the private variant is absent

#### Scenario: A student cannot reach the exam variant

- **WHEN** a student session requests the variant page with the variant preference set
- **THEN** the private variant is absent
- **AND** the public variant is what the student sees

#### Scenario: A teacher reading the page in the student view

- **WHEN** a teacher session with the variant preference set switches the teacher view off and loads the variant page
- **THEN** the public variant is present and the private variant is absent
- **AND** the question is the one a student session is shown on the same page

#### Scenario: The answer block

- **WHEN** the optional preference is set, and when it is cleared
- **THEN** the optional block is present in the first case and absent in the second, with no other preference changed between the two reads

## ADDED Requirements

### Requirement: The corpus names no unknown view marker

A check SHALL read every Markdown file of the corpus and fail for each directive, inline or whole-file, that names a view marker other than `#variant-private`, `#variant-public` and `#optional`. The failure SHALL name the file, the line and the marker. Marker lines inside fenced code blocks and `@@@` mentioned in running text SHALL NOT count, by the same grammar that decides block boundaries (`permission-block-grammar`). Because an unknown marker hides its block from everyone, a leftover old name would otherwise only show as missing content.

#### Scenario: A test page still carries a retired name

- **WHEN** a file in `md/` carries a line `@@@ #exam`
- **THEN** the check fails and names that file, that line and `#exam`

#### Scenario: A retired name in a syntax example

- **WHEN** a file in `md/` mentions `` `@@@ #exam` `` only in running text or inside a closed fenced code block
- **THEN** the check does not fail for it

