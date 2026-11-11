# math-rendering Specification

## Purpose

Typesets LaTeX formulas written with Obsidian's `$…$` and `$$…$$` delimiters, in every view and without any host but the application, while dollar signs that are not math stay text.

## Requirements

### Requirement: Dollar delimiters typeset a formula

Text between `$` and `$` on one line SHALL be typeset as an inline formula, when the opening `$` is not followed by whitespace, the closing `$` is not preceded by whitespace, and the closing `$` is not followed by a digit. Text between `$$` and `$$`, on one line or across lines, SHALL be typeset as a display formula, set apart from the text and centered. The formula SHALL be typeset in the response the application sends, so it shows in the page, document and presentation views without client-side processing.

#### Scenario: An inline formula

- **WHEN** a paragraph contains `Pythagoras: $a^2 + b^2 = c^2$.`
- **THEN** the formula is shown typeset within the line

#### Scenario: A display formula across lines

- **WHEN** a page contains a line `$$`, then `\frac{a}{b}`, then a line `$$`
- **THEN** a centered fraction is shown on its own

#### Scenario: A formula on a slide

- **WHEN** a formula stands under an `h2` of a deck
- **THEN** the slide shows it typeset

### Requirement: What is not math

A `$` that does not satisfy the delimiter rule SHALL stay as written, and so SHALL `\$`, shown as `$`. `$` inside inline code or a fenced code block SHALL stay as written.

#### Scenario: Prices

- **WHEN** a paragraph contains `Kostet $5 und $10.`
- **THEN** it is shown as written, with no formula

#### Scenario: An escaped dollar

- **WHEN** a paragraph contains `\$x\$`
- **THEN** it is shown as `$x$`, with no formula

#### Scenario: Dollar signs in code

- **WHEN** inline code contains `$HOME` and a code block contains `echo "$a $b"`
- **THEN** both stay as written in the code

### Requirement: A formula that does not parse shows its source

A formula that cannot be typeset SHALL be shown as its source text, marked as an error, and the rest of the page SHALL render as it would without it.

#### Scenario: An unknown command

- **WHEN** a page contains `$\notacommand{x}$` followed by a paragraph
- **THEN** `\notacommand{x}` is shown marked as an error
- **AND** the following paragraph renders normally

### Requirement: Formulas need no other host

The stylesheet and fonts a typeset formula needs SHALL be served by the application to authenticated sessions, and no view SHALL load them from another host.

#### Scenario: A page with a formula offline from the internet

- **WHEN** a page with a formula is opened while only the application's host is reachable
- **THEN** the formula is shown with its fonts
