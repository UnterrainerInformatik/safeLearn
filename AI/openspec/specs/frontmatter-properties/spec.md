# frontmatter-properties Specification

## Purpose

Lets a corpus file carry Obsidian properties in a YAML frontmatter block without that block showing up as content or displacing the file's `@@@` directive, and makes the properties useful: searchable, viewable on request, and shown as header and footer.

## Requirements

### Requirement: Frontmatter is recognized at the start of a file only

A file SHALL be taken to have frontmatter when, after the leading invisible marks the pipeline already drops, its first line is `---` and a later line is `---`; trailing whitespace and a `\r` line ending on either line SHALL not matter. The frontmatter SHALL span from the first line through the first such closing line. A `---` anywhere else, and an opening `---` without a closing one, SHALL not be frontmatter and SHALL be treated as today.

#### Scenario: A homework file with properties

- **WHEN** a file starts with `---`, eight property lines and `---`, followed by `@@@ teacher` and the body
- **THEN** the first ten lines are its frontmatter and `@@@ teacher` is the first line of its body

#### Scenario: A rule later in the file

- **WHEN** a file starts with a heading and contains a `---` line further down
- **THEN** the file has no frontmatter and renders exactly as before

#### Scenario: An unclosed block

- **WHEN** a file's first line is `---` and no later line is `---`
- **THEN** the file has no frontmatter and renders exactly as before

### Requirement: Frontmatter is stripped before anything else reads the file

Every step that reads a corpus file's text SHALL see the file with its frontmatter removed: the whole-file `@@@` directive, the inline permission blocks, rendering in all three views, search, exam handouts and the check whether a page references an attachment. The line right after the frontmatter SHALL be treated as the file's first line, so a `@@@` directive there SHALL gate the file exactly as it would on line 1 of a file without frontmatter. The frontmatter's lines SHALL never be rendered as content in any view.

#### Scenario: The directive after the frontmatter is applied

- **WHEN** a file has frontmatter followed by `@@@ teacher` and a student opens it
- **THEN** the student is refused as for any `@@@ teacher` file, and the file is absent from the student's navigation and search

#### Scenario: Nothing of the block is shown

- **WHEN** a teacher opens that file in the page view, the document view or the presentation view
- **THEN** no property line, no rule and no heading made of property lines appears, and the presentation has no slide break where the block was

#### Scenario: A file without frontmatter is unchanged

- **WHEN** any existing file without frontmatter is rendered, searched or gated
- **THEN** the result is identical to today's

### Requirement: An unreadable block is stripped and yields no properties

When the frontmatter cannot be parsed as a mapping of property names to values, it SHALL still be stripped, the file SHALL be treated as having no properties, and the file SHALL render normally. The failure SHALL be logged on the server with the file's path and SHALL not be shown to readers.

#### Scenario: Broken YAML

- **WHEN** a file's frontmatter holds a line `themen: [unclosed`
- **THEN** the page renders its body, shows no header, footer or properties button, and the server log names the file

### Requirement: Property values are searched like body text

A search SHALL match a query against the property values of every file the session may see, by the same substring, case-insensitive rule as body text. A list value SHALL be matched item by item. A match in a property value SHALL return the file as a result, ranked like a match in body text, with the matching value as its snippet and no heading. Property names SHALL not be matched. A file the session may not see SHALL never be returned for a match in its properties.

#### Scenario: Finding homework by a topic

- **WHEN** a teacher searches `quarkus cdi` and a visible file lists `Quarkus CDI` under `themen`
- **THEN** the file is a result and its snippet shows `Quarkus CDI`

#### Scenario: Property names are not content

- **WHEN** a teacher searches `abgabe` and the only occurrence in a file is the property name `abgabe:`
- **THEN** that file is not a result for this match

#### Scenario: Gated properties stay hidden

- **WHEN** a student searches a value that occurs only in the properties of a `@@@ teacher` file
- **THEN** the student gets no result for it

### Requirement: The page view shows the properties on request

The page view of a file with at least one property SHALL offer a button that shows the file's properties as a message: every property name with its value, in the order of the file, a list value as its items, every value shown as text and never interpreted as HTML or Markdown. The message SHALL be closable, and SHALL be hidden until the button is used. A file without properties SHALL show no button. The presentation view and the document view SHALL offer no such button.

#### Scenario: Looking at a homework's properties

- **WHEN** a teacher opens the homework file in the page view and uses the properties button
- **THEN** a message lists `klasse: 4AHIF`, `ausgabe: 2026-11-10`, `abgabe: 2026-12-08`, …, and `themen` with its four topics

#### Scenario: Markup in a value is text

- **WHEN** a property value is `<b>x</b>`
- **THEN** the message shows the characters `<b>x</b>`, not bold text

#### Scenario: No properties, no button

- **WHEN** a file without frontmatter is opened in the page view
- **THEN** no properties button is shown

#### Scenario: Not in reveal

- **WHEN** the homework file is opened in the presentation view
- **THEN** no properties button and no properties message is shown

### Requirement: header and footer properties are shown as header and footer

When a file's properties contain `header` or `footer` with a text or number value, the page view and the document view SHALL show that value as a header above and a footer below the content, and the presentation view SHALL show it as a header and a footer on every slide. Values SHALL be shown as text, never interpreted as HTML or Markdown. A missing, empty or non-scalar `header` or `footer` SHALL show nothing in its place.

#### Scenario: Homework footer on the page

- **WHEN** the homework file with `footer: "4AHIF - WMC4 - Hausübung 1"` is opened in the page view
- **THEN** `4AHIF - WMC4 - Hausübung 1` is shown below the content

#### Scenario: Footer on every slide

- **WHEN** the same file is opened in the presentation view
- **THEN** every slide shows `4AHIF - WMC4 - Hausübung 1` as its footer

#### Scenario: Header only

- **WHEN** a file has `header: WMC4` and no `footer`
- **THEN** every view shows `WMC4` as header and no footer

#### Scenario: A list is not a footer

- **WHEN** a file has `footer:` with a list of two items
- **THEN** no footer is shown
