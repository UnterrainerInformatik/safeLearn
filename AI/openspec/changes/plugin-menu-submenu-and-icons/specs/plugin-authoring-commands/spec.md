## MODIFIED Requirements

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

## ADDED Requirements

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
