## ADDED Requirements

### Requirement: An admin finds a teacher by typing parts of the name

Wherever an admin picks teachers for a class, the list of teachers SHALL come with a text field that narrows it as the admin types. This covers entering a teacher on the class page, the teachers of a new class, and the directory's other teachers in the year change. The input SHALL be split at whitespace into pieces. A teacher SHALL be shown when every piece appears somewhere in their family name, given name or username. Case SHALL not matter, accents SHALL not matter (`ö` matches `o`), and the order of the pieces SHALL not matter. An empty field SHALL show every teacher the place offers. When no teacher matches, the place SHALL say so instead of showing an empty list. Teachers the admin has already ticked SHALL stay ticked while the field hides them, and SHALL be entered when the admin confirms. Narrowing SHALL happen in the page, without a request per keystroke.

#### Scenario: Pieces of a double name

- **WHEN** an admin types `gru lei` into the teacher field of the class page of `4BHIF`
- **THEN** `Gruber-Leitner Franz` is among the matches, and `Gruber Anna` is not

#### Scenario: Given name first

- **WHEN** an admin types `franz gru`
- **THEN** `Gruber-Leitner Franz` is among the matches

#### Scenario: Case and accents

- **WHEN** an admin types `HÖLL` and the directory holds the teacher `Holler Eva`
- **THEN** `Holler Eva` is among the matches

#### Scenario: Nobody matches

- **WHEN** an admin types `xyz` into the teacher field of a new class
- **THEN** the list says that no teacher matches, and no teacher is ticked or unticked by it

#### Scenario: A ticked teacher hidden by the filter

- **WHEN** an admin ticks `amaier` for a new class, then types `gru` so that `amaier` is hidden, and creates the class
- **THEN** `amaier` is entered in the new class

#### Scenario: Entering a match on the class page

- **WHEN** an admin types `gru lei` on the class page of `4BHIF` and enters `Gruber-Leitner Franz` from the matches
- **THEN** the class page lists `Gruber-Leitner Franz` among its teachers, and `Gruber-Leitner Franz` is no longer offered among the matches
