# reading-legibility Specification

## Purpose

Defines what a rendered SafeLearn page must present to the person reading it: glyphs with nothing softening them, a layout sized to the device rather than scaled down onto it, font families that resolve to files the deployment actually ships, code at the size of the prose around it, a dark theme that stays comfortable over a long session, and a link that does not change appearance once it has been followed. `page-bootstrap` governs when a page becomes visible; this governs what it looks like once it is.

## Requirements

### Requirement: Nothing softens the glyphs of the rendered text

A rendered page SHALL NOT apply any effect whose result is a blurred, offset or thinned copy of the text a reader reads. In particular it SHALL NOT cast a shadow behind body text, and it SHALL NOT override the platform's own glyph rasterisation. SafeLearn's readers spend long sessions on this text, so any effect that trades sharpness for style is a cost paid on every line.

#### Scenario: A reader opens a corpus page

- **WHEN** a reader opens a corpus page in the page view
- **THEN** no element carrying that page's prose resolves to a text shadow
- **AND** the page does not ask the platform for a rasterisation other than its default

#### Scenario: A reader opens a corpus page with the dark theme on

- **WHEN** a reader whose preference is the dark theme opens a corpus page
- **THEN** no shadow is cast behind the light text, in either theme's stylesheet

### Requirement: A page is laid out at the width of the device it is read on

The page view and the document view SHALL declare a viewport so that a browser lays the page out at the device's own width rather than at an assumed desktop width and scaling the result down. A downscaled layout costs sharpness twice over — the text is rendered smaller than it was designed to be, and then resampled. The declaration SHALL NOT pin the scale: a reader SHALL remain able to zoom.

#### Scenario: A reader opens a page on a narrow screen

- **WHEN** a reader opens a corpus page on a viewport narrower than the desktop layout
- **THEN** the page is laid out at that viewport's width
- **AND** the stylesheet rules written for narrow viewports take effect, rather than being bypassed by an assumed width

#### Scenario: A reader zooms

- **WHEN** a reader zooms a page in the page view or the document view
- **THEN** the zoom takes effect, because the page did not pin the scale or disable user scaling

#### Scenario: A deck is opened

- **WHEN** a reader opens content in the presentation view
- **THEN** that view keeps its own viewport declaration, whose scale pinning is what lets a deck size itself

### Requirement: Every font family a stylesheet names resolves to one the deployment ships

A font family named in a stylesheet SHALL be one this deployment declares, or a generic fallback reached on purpose. A name that matches nothing silently hands the text to whatever the browser happens to default to, which differs between a reader's machine and the next reader's, and which is typically a serif where a sans was intended. Every declaration naming a shipped family SHALL also carry a fallback chain ending in a generic family, so a font that fails to load degrades to a related shape rather than to the browser's default.

#### Scenario: A stylesheet names a family

- **WHEN** a stylesheet names a font family that is not a generic keyword
- **THEN** that name is one the deployment declares for the fonts it ships

#### Scenario: A reader reads a page's chrome

- **WHEN** a reader looks at the bar above a page, its navigation column, and its menu
- **THEN** all three render in the navigation font that reader has chosen, rather than one of them falling back to a browser default

#### Scenario: A shipped font fails to load

- **WHEN** a font file a page asks for does not arrive
- **THEN** the text falls back to a generic family of the same kind — a sans for prose, a monospace for code — rather than to whatever the browser defaults to

### Requirement: Code sits at the size of the prose around it

Code SHALL be rendered at a size in fixed proportion to the reader's chosen text size, whether it stands in a block or inline within a sentence. Left unstyled, an inline code span falls to the browser's generic monospace: a face that differs from one reader's machine to the next, and from the face of the code block beside it, at a size that holds only by the accident of an unrelated inline style. In a corpus that names identifiers in nearly every paragraph, that is a change of face and size in the middle of most lines.

#### Scenario: A reader changes their text size

- **WHEN** a reader changes their text size and opens a page containing both a code block and inline code
- **THEN** both are rendered in proportion to the size that reader chose

#### Scenario: A paragraph names an identifier

- **WHEN** a paragraph contains an inline code span
- **THEN** that span's size is within a small proportion of the surrounding prose, not the browser's own monospace default
- **AND** it is set in the same face as a code block on the same page

#### Scenario: A long token appears in code

- **WHEN** a code element contains a token too long for the width available
- **THEN** it is not broken at an arbitrary character within a word

### Requirement: The dark theme is legible over a long session

The dark theme SHALL pair its foreground and background at a contrast comfortably above the accessibility floor but below the maximum the palette allows. Pure white on near-black clears every threshold and is still the wrong choice for sustained reading: at that separation light glyphs bloom into the surrounding dark, which is felt as fatigue rather than seen as a defect.

#### Scenario: A reader reads a long page in the dark theme

- **WHEN** a reader with the dark theme opens a corpus page
- **THEN** the prose foreground against its background clears the WCAG AAA threshold for body text
- **AND** neither the foreground is pure white nor the contrast is at the maximum the pairing could reach

#### Scenario: Either theme is measured

- **WHEN** the prose of a corpus page is measured against its background in either theme
- **THEN** the ratio clears the WCAG AAA threshold for body text

### Requirement: A link looks the same whether or not it has been followed

A link SHALL present the same colour and the same underlining before and after a reader has followed it. A link that changes appearance on being visited reads as a different kind of element, and the state is invisible to the author, so a page's appearance depends on where its reader has been. Within running text a link SHALL carry an underline, so that it is not distinguished from the prose by colour alone.

#### Scenario: A reader follows a link and returns

- **WHEN** a reader follows a link in a page's text and returns to that page
- **THEN** the link is rendered in the same colour and with the same underlining as before it was followed

#### Scenario: A link stands in running text

- **WHEN** a link appears within a page's prose
- **THEN** it is underlined, so colour is not the only thing marking it

#### Scenario: A link stands in the navigation column

- **WHEN** a link appears in the navigation column or the file list
- **THEN** it may go without an underline, because a list of links is not prose and its items are not distinguished from surrounding text

#### Scenario: A link is read in the dark theme

- **WHEN** a reader with the dark theme opens a page containing a link in its text
- **THEN** the link carries the colour chosen for the dark theme rather than the one chosen for the light theme
- **AND** that colour clears the contrast threshold for body text against the dark background
