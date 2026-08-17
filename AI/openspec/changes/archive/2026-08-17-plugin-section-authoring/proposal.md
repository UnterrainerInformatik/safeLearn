Source proposal: `AI/proposals/plugin-section-authoring.md`

## Why

The two admin proposals exist so that documents can be *built* from class lists, not so that lists can be looked at. The work they lead to is this: a teacher writes one restricted section per student of a class, and restricts a passage to a set of people they pick. Both are text a person types by hand today — one `@@@ <name>` … `@@@` block per student, spelled right, in order, with a heading in each.

The text manipulation needs no directory. It works from a list pasted out of a mail or a spreadsheet, which is where such a list comes from today anyway. So it is built now, and when `plugin-admin-api-backend` lands, what changes is where the names come from and nothing else.

One thing about this is not a convenience feature. The server removes only what stands *between* the markers. A heading written above a block stays visible to every reader — so a document with one section per student, headed by each student's name outside the block, shows every student the names of all the others. That is the reason the heading goes inside the block, and it is a data-protection decision rather than a formatting one.

## What Changes

- **A command writes one restricted section per name**, in the order the names were given: the directive, a heading, a line to write in, the closing marker.
- **The names come from an input in the command, one per line.** Not from the selected text, and not from a file in the vault — a file would be a second source of truth beside the directory that is coming anyway.
- **The heading stands inside the block**, one level below the last heading above the insertion point. See above: outside it, it is a list of everyone's names shown to everyone.
- **A command wraps a selection in a directive** built from entries given the same way, so that a passage can be restricted to a set of people without typing the directive.
- **A name is written as it was given**, trimmed, in the author's own spelling. The server's comparison is lowercased anyway, so the spelling changes nothing about who can read it — and a document full of lowercased personal names reads badly.
- **A name the server will not read as a name is written anyway, and the command says so.** `admin`, `teacher`, `teachers`, `student` and `students` are reserved: `hasRoles` drops a display name equal to one of them rather than adding it, so `@@@ Students` addresses the *role* and is read by every student in the school. The command does not correct it — the source proposal settled that it inserts what it was given and decides nothing — but it names which entries that happened to, at the one moment when it is known that a person was meant.

## Capabilities

### New Capabilities

None. These are two more entries in the list `plugin-insert-commands` built, which is what that change built it for.

### Modified Capabilities

- `plugin-authoring-commands`: gains what the plugin writes when it is given names — the shape of a generated section, where its heading stands and why, where the names come from, and that a name colliding with a built-in role is written as given and reported rather than silently changed or silently kept.

## Impact

- **`main.ts` in the plugin repository**: two entries in `AUTHORING_COMMANDS`, a modal that takes a list of lines, the block builder, and the scan for the heading level above the insertion point.
- **`test/obsidian/plugin.test.js` and `test/obsidian/harness.js`**: the harness can answer a one-value dialog since `plugin-insert-commands`; it gains answering one that takes a list, and reading what a command reported.
- **`utils.js` is read, not changed.** `namesReservedForRoles` and the branch that drops a colliding display name are what makes the reporting true; the five names are mirrored in the plugin, and a divergence there would misinform in the direction that matters most.
- **`README.md`** in the plugin repository.
- **The directory this does not use.** When `plugin-admin-api-backend` and `plugin-admin-directory-ui` land, the list input is where a picker goes. Nothing else about these commands changes, which is why they were separated from those two in the first place.
