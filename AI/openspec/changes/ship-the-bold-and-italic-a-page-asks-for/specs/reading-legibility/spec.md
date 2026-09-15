## ADDED Requirements

### Requirement: Bold and italic are set in cuts the deployment ships

Where a rendered page asks for a bold or an italic, the deployment SHALL supply a font file drawn as that bold or that italic, rather than leaving the browser to derive one from the upright regular. A synthesised bold is the regular's outline smeared outward, and a synthesised italic is the regular sheared; neither preserves the stem-to-hairline relationship or the letterforms the typeface was drawn with. Headings are the common case rather than the rare one — the prose of the corpus carries a heading on nearly every screen — so this is a cost paid continuously rather than at the occasional emphasised word.

A family for which no such cut exists upstream SHALL be a recorded exception, named as one, and SHALL NOT be silently indistinguishable from a family whose cut simply was not shipped.

#### Scenario: A reader opens a page with headings

- **WHEN** a reader opens a corpus page containing a heading, in any main font the picker offers
- **THEN** that heading is rendered from a font file the deployment ships for that weight
- **AND** the browser reports no synthesised weight for it

#### Scenario: A reader reads an emphasised passage

- **WHEN** a reader opens a corpus page containing emphasised text and strongly emphasised text
- **THEN** each is rendered from a shipped file for that style and weight, where the chosen family has one
- **AND** text that is both emphasised and strongly emphasised is rendered from the shipped bold italic rather than from the bold sheared

#### Scenario: A family has no italic upstream

- **WHEN** a reader chooses a main font whose family ships no italic cut
- **THEN** the deployment names that family as an exception, with the reason recorded alongside it
- **AND** italic text on the page falls to what the browser derives, because that is the only thing available

#### Scenario: A deck sets a word in italic

- **WHEN** a deck is opened in the presentation view and sets text in italic
- **THEN** it is rendered from a shipped italic file at the weight the deck's styling actually resolves to, not only at the weight its theme names for body text

#### Scenario: The set of shipped files is inspected

- **WHEN** the files the deployment ships as fonts are inspected
- **THEN** each family offered in a picker has, beside its regular, the cuts recorded for it — and no cut is recorded for a family that does not ship it

### Requirement: A reader's chosen font keeps its meaning when the shipped set changes

A reader's stored choice of main font and of navigation font SHALL continue to denote the same typeface after fonts are added to or removed from the deployment. A choice recorded as a position in a list built in whatever order a filesystem enumerates a directory is not stable: adding a file can move the entries already in it, and every reader then silently reads in a font they did not choose. The order in which the picker offers its fonts SHALL therefore be determined by the deployment rather than by the filesystem.

#### Scenario: Font files are added to the deployment

- **WHEN** font files are added to the directories the deployment serves fonts from, and a reader who had chosen a font returns
- **THEN** that reader's page is rendered in the font they chose, not in another entry of the picker

#### Scenario: The picker is opened twice on different machines

- **WHEN** the same deployment's font picker is opened on two machines whose filesystems enumerate the font directories differently
- **THEN** it offers the same fonts in the same order on both

#### Scenario: A reader's stored choice names a font that is gone

- **WHEN** a reader's stored choice does not correspond to any font the deployment currently offers
- **THEN** the page is rendered in the deployment's first offered font rather than in nothing

### Requirement: The font picker offers one entry per typeface

The font picker SHALL offer one entry per typeface a reader can choose, and SHALL NOT offer a weight or a style of a typeface as an entry of its own. A reader chooses what their prose is set in; the bold and the italic of that choice are consequences of the text, not further choices.

#### Scenario: A reader opens the font picker

- **WHEN** a reader opens the main font picker or the navigation font picker
- **THEN** each entry names a typeface
- **AND** no entry names a weight or a style, whether or not the deployment ships a file for it

## MODIFIED Requirements

### Requirement: Every font family a stylesheet names resolves to one the deployment ships

A font family named where a page's styling is set SHALL be one this deployment declares, or a generic fallback reached on purpose — whether it is named in a stylesheet or written onto an element as an inline style by the renderer. A name that matches nothing silently hands the text to whatever the browser happens to default to, which differs between a reader's machine and the next reader's, and which is typically a serif where a sans was intended. Every declaration naming a shipped family SHALL also carry a fallback chain ending in a generic family, so a font that fails to load degrades to a related shape rather than to the browser's default. Which generic family a shipped font falls back to SHALL follow from what that font is — a serif behind a serif, a monospace behind a monospace — rather than from one generic applied to all of them.

#### Scenario: A stylesheet names a family

- **WHEN** a stylesheet names a font family that is not a generic keyword
- **THEN** that name is one the deployment declares for the fonts it ships

#### Scenario: A reader reads a page's chrome

- **WHEN** a reader looks at the bar above a page, its navigation column, and its menu
- **THEN** all three render in the navigation font that reader has chosen, rather than one of them falling back to a browser default

#### Scenario: A shipped font fails to load

- **WHEN** a font file a page asks for does not arrive
- **THEN** the text falls back to a generic family of the same kind — a sans for prose, a monospace for code — rather than to whatever the browser defaults to

#### Scenario: The reader's chosen fonts are written onto the page

- **WHEN** the renderer writes a reader's chosen main font onto the content, and their chosen navigation font onto the page's chrome
- **THEN** each is written with a fallback chain behind it ending in the generic family that font belongs to
- **AND** a reader whose chosen file does not arrive reads in a face of the same kind rather than in the browser's default
