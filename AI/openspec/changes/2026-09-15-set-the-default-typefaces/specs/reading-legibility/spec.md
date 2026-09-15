## ADDED Requirements

### Requirement: The deployment nominates the typefaces a reader who has chosen none reads in

The deployment SHALL nominate, by typeface name, the face its prose is set in and the face its chrome is set in, and a reader who has expressed no preference SHALL be served those two. The nomination SHALL be a name rather than a position in the list the picker offers: a position is a property of how a directory happened to be enumerated and of how many files are in it, so a default expressed as one changes whenever the shipped set changes, and says nothing about why that face was chosen. A face nominated for prose and a face nominated for chrome are two separate nominations, because the two are read differently — a paragraph is read across, a label is read at.

Where a nominated typeface is not among those the deployment offers for that part of the page, the page SHALL still be set in a face the deployment ships rather than in none.

#### Scenario: A reader who has never chosen a font opens a page

- **WHEN** a reader with no stored font preference opens a corpus page
- **THEN** its prose is set in the typeface the deployment nominates for prose
- **AND** the bar above the page, its navigation column and its menu are set in the typeface the deployment nominates for chrome

#### Scenario: Fonts are added to the deployment and an unconfigured reader returns

- **WHEN** font files are added to or removed from the directories the deployment serves fonts from, and a reader with no stored preference opens a page
- **THEN** that page is set in the same two typefaces as before, because neither is identified by its position among the offered fonts

#### Scenario: A reader asks for the deployment's font back

- **WHEN** a reader who has chosen a font uses the control that restores the deployment's own
- **THEN** their stored preference becomes the nominated typeface, recorded the same way a preference chosen from the picker is recorded

#### Scenario: A nominated typeface is not shipped

- **WHEN** the deployment nominates a typeface that its font directories do not offer for that part of the page
- **THEN** the page is set in one of the fonts that part of the page does offer, rather than in the browser's own default

## MODIFIED Requirements

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
- **THEN** the page is rendered in the typeface the deployment nominates for that part of the page, rather than in nothing and rather than in whichever font happens to sort first
