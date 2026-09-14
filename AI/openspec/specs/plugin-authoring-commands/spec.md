# plugin-authoring-commands Specification

## Purpose
TBD - created by archiving change plugin-insert-commands. Update Purpose after archive.

## Requirements

### Requirement: The plugin writes the tags it recognizes

The plugin SHALL offer commands that insert SafeLearn tags into the document, so that a tag can be written without being typed. What a command inserts SHALL be built from the same spellings the plugin recognizes, so that a command cannot produce a tag the plugin does not mark or the server does not act on.

#### Scenario: A tag is inserted

- **WHEN** an authoring command is invoked in an editor
- **THEN** what it writes into the document is marked by the plugin as the tag it is

### Requirement: What is inserted is well-formed for the renderer

Each marker a command writes SHALL stand alone on a line of its own, and an insertion SHALL begin on a line of its own rather than in the middle of one. A marker sharing a line with other text is a marker the plugin does not mark and the server's block boundaries fall inside running text, so what a command writes SHALL NOT be a form that only one of the two reads.

#### Scenario: The cursor stands in the middle of a line

- **WHEN** a command is invoked with the cursor inside a line of text
- **THEN** what is inserted begins on a new line, and no marker shares a line with the text that was there

#### Scenario: A block is inserted

- **WHEN** a command inserts a block of markers
- **THEN** each marker is on a line of its own, and the block is one the renderer reads as a block

### Requirement: An insertion never displaces a directive that gates the file

A directive on the first line gates the whole document, and it does so by standing on the first line and by nothing else. An authoring command SHALL NOT push it down: an insertion that would be written above it SHALL be written below it instead. A command run to add a marker SHALL NOT change who may read the document.

Where such a line is part of what a person selected, this does not apply — the selection names it, and what follows is shown by the marking that stops saying the file is gated.

#### Scenario: A command is invoked at the very start of a gated document

- **WHEN** a command is invoked with the cursor at the start of a document whose first line gates the file
- **THEN** what it writes stands below that line, and the first line of the document is unchanged

#### Scenario: A command reaches upward for the block it is given

- **WHEN** a command that writes above the block the cursor is in is invoked in a block that reaches the first line of a gated document
- **THEN** it writes below the gating line rather than above it

### Requirement: A side-by-side block is inserted with two columns without asking

The common case SHALL be a command that lays out two columns and asks nothing. A second command SHALL ask how many columns, for the cases that are not two. There SHALL NOT be a further command for a specific other number: an entry that is read past every time costs more than it saves.

#### Scenario: The two-column command is invoked

- **WHEN** the command for two columns is invoked
- **THEN** a two-column block is inserted, with nothing asked

#### Scenario: The command that asks is invoked

- **WHEN** the command that asks for a column count is invoked
- **THEN** the count is asked for, and a block with that many columns is inserted

#### Scenario: A count below two is given

- **WHEN** a count that would not produce a side-by-side block is given
- **THEN** no such block is inserted

### Requirement: A selection is enclosed whole and never divided

Where a command is invoked with text selected, that text SHALL be enclosed by the block unchanged, and SHALL NOT be split between columns. The separators SHALL be written after the selected content, so that where the columns divide is left to the person who selected it.

#### Scenario: Several paragraphs are selected

- **WHEN** a side-by-side command is invoked with more than one paragraph selected
- **THEN** the selected text is inside the block exactly as it was, with no separator written into it

#### Scenario: A block of more than two columns is inserted around a selection

- **WHEN** the command that asks for a count is answered with more than two
- **THEN** the selection stands in the first column and the remaining columns are there to be written in, each reachable without making room first

### Requirement: A fragment marker is inserted before the block the cursor is in

A fragment marker SHALL be written on a line of its own above the block the cursor stands in — the run of lines it belongs to — rather than above the cursor's own line. A marker written into the middle of a paragraph divides it, and makes a fragment of a half nobody asked to separate.

#### Scenario: The cursor is in the middle of a paragraph

- **WHEN** the fragment command is invoked with the cursor inside a paragraph
- **THEN** the marker stands on its own line above that whole paragraph, and the paragraph is not divided

#### Scenario: Text is selected

- **WHEN** the fragment command is invoked with text selected
- **THEN** the marker stands on its own line above the selected text

### Requirement: Every authoring command is reachable from the palette and from the editor's context menu

The commands SHALL be offered in Obsidian's command palette and in the editor's context menu, and both SHALL be built from one description of what the commands are. A command SHALL NOT be able to exist in one of the two and not the other.

A command SHALL carry one name, used wherever it is offered. A second label kept for a second surface is a label that can come to disagree with the first, and the surface each is read in is what supplies the context the words need not repeat.

The context menu belongs to Obsidian, and other plugins add to it too. The plugin SHALL therefore contribute a single entry to it and offer its commands below that entry, rather than placing each of them among the entries of others. What the menu costs somebody who wants none of them SHALL stay one line, however many commands the plugin comes to offer.

That nesting SHALL NOT be the condition of a command being reachable. Where the running application cannot nest one menu inside another, the commands SHALL still all be offered in the context menu, standing together — a menu built for somebody who right-clicked is not the place to fail.

#### Scenario: A command is added

- **WHEN** the set of authoring commands gains an entry
- **THEN** that entry is offered in both the palette and the context menu, without either being maintained separately

#### Scenario: The context menu is opened in an editor

- **WHEN** the editor's context menu is opened
- **THEN** the plugin has put a single entry in it, and each of its commands is reachable below that entry

#### Scenario: The application cannot nest one menu inside another

- **WHEN** the context menu is built where a submenu cannot be made
- **THEN** every command is offered in that menu nonetheless, standing together, and building it raises nothing

### Requirement: Every entry the plugin puts in the context menu is shown with an icon

Each entry the plugin contributes to the editor's context menu — the one carrying its commands, and every command below it — SHALL be shown with an icon, and that icon SHALL be one the running application already holds rather than artwork the plugin brings with it.

None SHALL be left without one. A menu item is laid out as an icon and a title beside it, so an entry with no icon does not move left: it leaves that column empty while its title stands where the others' do, and a menu of which some rows carry an icon and some do not reads as one where something failed to load.

An icon SHALL be named such that the application draws it. A name the application's set does not hold produces an empty icon column and no error at all, which is why the drawn entry rather than the name asked for is what this is judged by.

#### Scenario: The plugin's entries are shown

- **WHEN** the editor's context menu is open with the plugin's entries in it
- **THEN** every one of them shows a drawn icon beside its title

#### Scenario: An entry names an icon the application does not hold

- **WHEN** an entry is given an icon name that is not in the set the running application ships
- **THEN** it is shown with an empty icon column, and nothing about the name it was given says otherwise

### Requirement: A command changes the document and leaves the cursor where writing continues

An authoring command SHALL change the document text and nothing else about the session — not the view, not the scroll position, not the selection of another editor. After it has run, the cursor SHALL stand where the next thing a person writes belongs.

#### Scenario: A command is invoked with nothing selected

- **WHEN** a command that inserts an empty structure is invoked
- **THEN** the cursor is left in the place that structure is waiting to have written into it

#### Scenario: A command is invoked

- **WHEN** any authoring command runs
- **THEN** the only difference it makes is to the text of the document it was invoked in

### Requirement: A restricted section is written for each name that was given

A command SHALL write one restricted section per name, in the order the names were given: the directive naming that name, a place to write, and the closing marker. The sections SHALL be written as one insertion, so that a list produces a document rather than a sequence of separate edits.

A generated section SHALL carry no heading of its own. The rendered frame already carries the addressed name as its heading (`plugin-hidden-tags`'s "A restricted block carries its name as a heading"), so a heading written into the section's content would repeat, in the document's own text, what every reader already sees rendered above it.

#### Scenario: A list of names is given

- **WHEN** the command is given several names
- **THEN** the document holds one restricted section per name, in that order, each addressed to its own name, with a single blank line as its content

#### Scenario: A name is given more than once or the list holds a blank line

- **WHEN** the list contains blank lines or surrounding whitespace
- **THEN** the blank lines produce no section and each name is written trimmed

### Requirement: The names are given to the command

The list SHALL be given either by choosing people from the directory picker (`plugin-directory-search`), where one is shown, or by typing or pasting names into the command, one per line, where it is not — and a command SHALL NOT leave a person with neither: where the picker is shown but cannot offer anybody, because the directory could not be reached or the request failed there, the typed/pasted field SHALL be available instead. It SHALL NOT be taken from the selected text, and SHALL NOT be read from a file in the vault: the first makes selecting the wrong thing a silent way to generate the wrong document, and the second would be a second source of truth beside the directory itself.

Where the picker is shown, the people chosen in it are the whole list, and a name the directory has no entry for is written into the document afterwards rather than typed into the command.

#### Scenario: A list is pasted into the command

- **WHEN** a class list copied out of a mail or a spreadsheet is pasted into the command, where no picker is shown
- **THEN** it is read as one name per line, and nothing in the document decides what the names are

#### Scenario: Names are chosen from the directory picker

- **WHEN** the picker is used, and one or more people are chosen and confirmed
- **THEN** the command receives their display names, in the order they were chosen, exactly as if they had been typed one per line

#### Scenario: No instance is configured

- **WHEN** no safeLearn instance is configured
- **THEN** the command offers only the typed/pasted list, exactly as it does today

#### Scenario: An instance is configured but no login is held

- **WHEN** an instance is configured, no login is held, and no picker is therefore shown
- **THEN** the command offers the typed/pasted list, exactly as it does where no instance is configured

#### Scenario: The picker is shown but the directory cannot be reached

- **WHEN** the picker is shown and the directory cannot be reached, or the request fails at the server
- **THEN** the typed/pasted field is available, so the command can still be given a list

### Requirement: A name is written as it was given

A name SHALL be written into the directive trimmed and otherwise unchanged, in the spelling it was given in. The server's comparison is trimmed and lowercased, so the spelling does not change who may read the block — and a document of lowercased personal names is a document nobody wants to read.

#### Scenario: A name is given with capitals

- **WHEN** a name is given as a person writes their own name
- **THEN** the directive carries it that way

### Requirement: A name the server will not read as a name is written and reported

The command SHALL write the name as it was given, and SHALL NOT correct, drop or alter it. It SHALL report which of the given names that happened to, once, after writing them — the command is the only place in the plugin that knows a *person* was meant, and without it the collision is not visible anywhere.

`admin`, `teacher`, `teachers`, `student` and `students` are reserved: the server drops a display name equal to one of them rather than adding it to the reader's role set. A section addressed to such a name is therefore addressed to the *role*, and is read by everyone holding it.

#### Scenario: A given name collides with a built-in role

- **WHEN** one of the given names equals a name the server reserves for a role
- **THEN** the section is written for that name unchanged, and the command names it as one the server will read as a role rather than as a person

#### Scenario: No given name collides

- **WHEN** none of the given names is reserved
- **THEN** the command reports nothing about them

### Requirement: A passage is restricted from entries given to the command

A command SHALL build a directive from entries given the same way, one per line, and place it around the selected text with its closing marker after it. Where nothing is selected it SHALL write the directive, a place to write and the closing marker, and SHALL NOT restrict text the person did not point at.

#### Scenario: A passage is selected

- **WHEN** the command is invoked with text selected
- **THEN** that text is enclosed by a directive naming the given entries, unchanged

#### Scenario: Nothing is selected

- **WHEN** the command is invoked with nothing selected
- **THEN** an empty restricted block is written and the cursor is left inside it, and no surrounding text is restricted

### Requirement: A semester's dates are written as a table rather than typed

The plugin SHALL offer a command that writes a table of lesson dates, so that the part of a semester table with no judgement in it need not be typed out. The command SHALL ask for the span the table covers and which weekdays the class meets, and SHALL write the table only once that has been confirmed — a table of the wrong dates is worse than no table, because it is corrected row by row.

What it asks for SHALL be a start date, an end date, the weekdays to write rows for, and the subject columns to lay out. The start date SHALL default to the day the command is run, which is the date a teacher setting up a semester most often starts from.

#### Scenario: The command is invoked

- **WHEN** the semester table command is invoked in an editor
- **THEN** a dialog asks for a start date, an end date, weekdays, and subject columns, and nothing is written into the document yet

#### Scenario: The dialog opens

- **WHEN** the dialog opens
- **THEN** the start date already holds the current day

#### Scenario: The dialog is dismissed

- **WHEN** the dialog is closed without generating
- **THEN** the document is unchanged

### Requirement: The table is written in the shape the corpus already uses

The table SHALL carry, in this order: a marker column whose heading is empty, a column of weekdays where more than one weekday was ticked, a column of dates, the subject columns as they were given, and an `Info` column. It SHALL be a table the renderer reads as one — a heading row, a delimiter row beneath it, and one row per lesson.

Where exactly one weekday was ticked, the weekday column SHALL be left out. Every row would carry the same three letters, and a column of one value costs width in a table that is already wide while saying nothing the date beside it does not. Whether the column is written SHALL follow from what was ticked and not from which weekdays the range happens to contain, so that it is answered by the dialog rather than by the end date: a table for Mondays and Thursdays keeps its weekday column even over a span short enough to hold only a Monday.

The headings the command supplies itself SHALL read `Day`, `Date` and `Info`, and dates SHALL be written as `dd.MM.yyyy`. The semester files in the corpus are already written this way, and a command that generated a second spelling would make the corpus disagree with itself over which one is the format.

A subject column SHALL be asked for as the two halves the headings in the corpus are made of — the subject, and who takes it — and the two SHALL be written as one heading with a line break between them (`0WMC<br>(UNTEG)`). That line break is markup, and a dialog that expected a person to type it would be asking them to know the format the dialog exists to spare them. Where only one half is given, the heading SHALL be that half alone: a line break written above nothing leaves a heading sitting high in its row, and somebody who filled in one field meant one line.

The half naming who takes the subject SHALL be written in parentheses — `UNTEG` written as `(UNTEG)` — and a half that already carries them SHALL be written as it stands rather than bracketed a second time. The parentheses are part of the form every heading in the corpus has, exactly as the line break is, and a dialog that asked a person to type them would be asking them for the format it exists to spare them.

Each half SHALL otherwise be written exactly as it was given. What belongs in a heading beyond its two halves is the author's to decide; a command that reformatted it would be deciding it instead.

#### Scenario: A table is generated

- **WHEN** the dialog is generated from with more than one weekday ticked
- **THEN** a table is written whose columns are, in order, the marker column with an empty heading, `Day`, `Date`, each subject column given, and `Info`

#### Scenario: The class meets on one weekday

- **WHEN** the dialog is generated from with exactly one weekday ticked
- **THEN** the table carries no `Day` column: its columns are, in order, the marker column with an empty heading, `Date`, each subject column given, and `Info`

#### Scenario: A row is written

- **WHEN** a row is written for a date
- **THEN** its date stands in the `Date` column as `dd.MM.yyyy`, its weekday stands in the `Day` column in short form wherever that column is written, and its subject and info cells are empty

#### Scenario: Subject columns are given

- **WHEN** a subject and who takes it are given for a column
- **THEN** that column's heading stands between `Date` and `Info`, in the order given, carrying the subject as it was written over who takes it in parentheses, with a line break between them

#### Scenario: Who takes the subject is given with parentheses already

- **WHEN** the half naming who takes the subject is given already carrying its parentheses
- **THEN** the heading carries that half as it was given, with one pair of parentheses and not two

#### Scenario: Only one half of a heading is given

- **WHEN** a subject column is given a subject but nobody to take it, or the other way round
- **THEN** its heading is the half that was given, in parentheses where it is the half naming who takes it, with no line break and no empty second line

#### Scenario: No subject column is given

- **WHEN** the dialog is generated from with no subject column named
- **THEN** a well-formed table is still written, carrying the marker column, `Date` and `Info`, and `Day` where more than one weekday was ticked

### Requirement: Every date in the range is written and none is skipped

For each date from the start date to the end date whose weekday was ticked, the command SHALL write one row, in chronological order. Both ends of the range SHALL be included where their weekday was ticked.

The command SHALL NOT leave a date out on account of it being a holiday or otherwise not taught. It SHALL hold no calendar of school holidays: those are local and change from year to year, so a calendar carried in the plugin would be wrong somewhere and would go stale. More than that, the rows are not waste — an unbroken run of weeks is the overview the table exists to give, and a break in the teaching is written *into* the row it falls on, by the person who knows what the break is.

#### Scenario: A range covering several weeks is generated

- **WHEN** a range is generated for with one weekday ticked
- **THEN** there is one row for every occurrence of that weekday in the range, a week apart, in chronological order

#### Scenario: More than one weekday is ticked

- **WHEN** a range is generated for with several weekdays ticked
- **THEN** every occurrence of each of them is written, and the rows are in date order rather than grouped by weekday

#### Scenario: The range begins or ends on a ticked weekday

- **WHEN** the start date or the end date itself falls on a ticked weekday
- **THEN** that date has a row

#### Scenario: A holiday falls inside the range

- **WHEN** a ticked weekday falls on a school holiday inside the range
- **THEN** its row is written like any other, and the table has no gap

### Requirement: The first lesson is marked

The first data row SHALL be written with the marker already in its first column, and every other row SHALL be written with that column empty. The marker is how the table says which lesson is next, and at the moment the table is generated that is its first row.

There is no cell background in Markdown, which is why the marker is a character in a column of its own rather than a highlighted row.

#### Scenario: A table is generated

- **WHEN** a table with at least one row is written
- **THEN** the first data row carries the marker in its first column and the remaining rows have that column empty

### Requirement: A span that describes no lessons writes no table

Where the end date falls before the start date, or where no weekday was ticked, there are no rows to write, and the command SHALL NOT write a table. A heading row over nothing is not a semester table; it is a thing to delete before the dialog can be answered properly.

#### Scenario: The end date is before the start date

- **WHEN** an end date earlier than the start date is generated from
- **THEN** no table is written into the document

#### Scenario: No weekday is ticked

- **WHEN** the dialog is generated from with no weekday ticked
- **THEN** no table is written into the document

#### Scenario: The range holds no occurrence of a ticked weekday

- **WHEN** a range too short to contain any ticked weekday is generated from
- **THEN** no table is written into the document

### Requirement: Generating a table never costs the author text they had selected

Where the command is invoked with text selected, that text SHALL survive: the table SHALL be written without replacing it. A table has no place to enclose a selection the way a side-by-side block or a restricted section does — it is a grid of empty cells, not a wrapper — so the selection is neither enclosed nor consumed.

#### Scenario: The command is invoked with text selected

- **WHEN** a table is generated with text selected in the editor
- **THEN** the selected text is still in the document, and the table stands alongside it

### Requirement: A command that asks for something asks it in a dialog with a separated confirmation

Where a command needs an answer before it can write, it SHALL ask in a dialog whose confirmation is visibly separated from the field it confirms. The confirmation SHALL stand in the container Obsidian lays dialog buttons out in, so that the distance between the two comes from the theme in use rather than from a length the plugin carries.

A dialog SHALL NOT place its confirmation directly against its field: a button touching the lower edge of the field above it reads as one control with it, and a click aimed at the one lands in the other.

#### Scenario: A dialog that asks for a count is open

- **WHEN** the command that asks for a column count has opened its dialog
- **THEN** the button's box stands below the field's box and the two do not touch

#### Scenario: A dialog that asks for a list is open

- **WHEN** the command that asks for a list of names has opened its dialog
- **THEN** the button's box stands below the field's box and the two do not touch

### Requirement: Every dialog the commands open is laid out the same way

The dialogs ask different things, and what differs between them SHALL be the field alone: a number field, a list of names, whatever a later command needs. Everything around it — the heading, whatever explains the field, and the confirmation below it in its container — SHALL be the same in each, so that two dialogs asking one kind of question do not answer it in two shapes.

#### Scenario: A dialog is opened

- **WHEN** either dialog is opened
- **THEN** it shows a heading, the field it is about, and its confirmation below that field

#### Scenario: The two dialogs are compared

- **WHEN** both dialogs are opened in turn
- **THEN** they are laid out alike, and what tells them apart is the field each carries

### Requirement: How a dialog is laid out changes nothing about what is written

Laying a dialog out is a statement about the dialog and about nothing else. What a command writes into the document from a given answer, what it defaults to, and what it refuses SHALL be unaffected by it. A dialog SHALL be confirmable from the keyboard whatever it asks with, so that replacing a field with another way of answering does not take the keyboard confirmation away with it.

#### Scenario: A count is given

- **WHEN** a column count is given and confirmed
- **THEN** the block that is inserted is the one that count has always produced, and Enter confirms the dialog as it did

#### Scenario: A list is given

- **WHEN** a list of names is given and confirmed
- **THEN** the sections that are written are the ones that list has always produced

#### Scenario: A list is confirmed from the keyboard

- **WHEN** the dialog that asks for a list of names is confirmed with Ctrl/Cmd+Enter
- **THEN** it confirms, whether the list was typed into a field or chosen from the picker

#### Scenario: Enter while typing a list

- **WHEN** Enter is pressed while typing names into the field, where the field is shown
- **THEN** it belongs to the list, and does not confirm the dialog
