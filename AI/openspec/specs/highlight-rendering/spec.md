# highlight-rendering Specification

## Purpose
Defines how SafeLearn renders Obsidian's highlight syntax — `==text==` and the six colours Obsidian 1.14 selects by an emoji after the opening `==` — in the page, document and presentation views: what forms a highlight, how its colour is chosen, that it stays legible in every theme, and where a `==` is left as written.

## Requirements

### Requirement: A highlight renders as a highlight

Text enclosed in `==` on a single line SHALL render as highlighted text in the page view, the document view and the presentation view, without the enclosing `==`. Inline formatting inside the highlight SHALL render as it would outside it.

#### Scenario: A plain highlight is rendered

- **WHEN** a corpus file contains `==A plain highlight==`
- **THEN** the rendered page shows "A plain highlight" as highlighted text in the default tint
- **AND** the equals signs are not shown

#### Scenario: A highlight contains other formatting

- **WHEN** a highlight contains bold text or a link
- **THEN** the bold text is bold and the link is a link, inside the highlight

### Requirement: A colour emoji selects one of six tints

When one of 🔴, 🟠, 🟡, 🟢, 🔵, 🟣 stands directly after the opening `==`, optionally followed by the emoji variation selector, the highlight SHALL take the corresponding tint — red, orange, yellow, green, blue, purple — and the emoji SHALL NOT be shown. The six tints and the default tint SHALL be distinguishable from one another. Any other character after the opening `==` SHALL be part of the highlighted text.

#### Scenario: A coloured highlight is rendered

- **WHEN** a corpus file contains `==🔴red==`
- **THEN** the rendered page shows "red" highlighted in the red tint
- **AND** the red circle is not shown

#### Scenario: Every colour is told apart

- **WHEN** the corpus page carrying the default highlight and all six colours is rendered
- **THEN** the seven highlights carry seven different backgrounds

### Requirement: A highlight stays legible in every theme

Highlighted text SHALL keep the text colour of its surroundings, so that it has the contrast the surrounding text has. The tint SHALL be adapted to the dark theme and to the presentation view, whose backgrounds are dark.

#### Scenario: Highlighted text in dark mode

- **WHEN** a page with highlights is rendered with dark mode on
- **THEN** the highlighted text has the colour of the text around it rather than a fixed dark colour

### Requirement: A `==` that is not a highlight is left as written

A `==` inside an inline code span or a fenced code block SHALL be rendered as written. A run of three or more equals signs SHALL NOT open a highlight, and neither SHALL a pair enclosing nothing but whitespace or a pair whose content crosses a line break.

#### Scenario: Equals signs inside code

- **WHEN** a corpus file contains `` `==not in code==` ``
- **THEN** the code span shows `==not in code==` unchanged and no highlight is formed

#### Scenario: A comparison in prose

- **WHEN** a corpus file contains `a === b == c` outside code
- **THEN** it is rendered as written and no highlight is formed
