## 1. Read what the server does with a name

- [x] 1.1 Read `hasRoles` (`utils.js`) and `namesReservedForRoles`: that the display name enters the role set as a role, that the five reserved names are dropped instead, and that every comparison is trimmed and lowercased.
- [x] 1.2 Read `removeForbiddenContent` (`obsidian.js`) and confirm that only what stands between the markers is removed — which is the whole reason the generated heading goes inside the block.

## 2. What the plugin has to know about a name

- [x] 2.1 Mirror the five reserved names into the recognition block of `main.ts`, beside the other rules taken from the server, and say there that it is a mirror.
- [x] 2.2 Add a way to ask whether a given name is one of them, by the server's own comparison — trimmed and lowercased.

## 3. One restricted section per name

- [x] 3.1 Add a modal that takes a list of lines, so a class list can be pasted into it.
- [x] 3.2 Skip blank lines and trim each name; leave the spelling alone.
- [x] 3.3 Find the last heading above the insertion point and take its level; the generated heading is one below it, capped at six, and level one where there is none.
- [x] 3.4 Build the sections as one insertion: per name the directive, the heading inside the block, a line to write in, the closing marker, and a blank line between sections.
- [x] 3.5 Report the given names the server will read as a role rather than as a person, after writing them, without changing any of them.
- [x] 3.6 Register the command in the list `plugin-insert-commands` built.

## 4. Restricting a passage

- [x] 4.1 Add the command that takes entries the same way and encloses the selection in a directive built from them.
- [x] 4.2 With nothing selected, write an empty restricted block and leave the cursor inside it rather than restricting text nobody pointed at.
- [x] 4.3 Register it in the same list.

## 5. Give the harness what it lacks

- [x] 5.1 Add answering a dialog that takes a list of lines.
- [x] 5.2 Add reading what a command reported, so a check can establish that a collision was named.

## 6. Check it

- [x] 6.1 A list of three names produces three sections, in that order, each addressed to its own name.
- [x] 6.2 The heading of each section stands between the directive and the closing marker, established against the server's own rule rather than by eye.
- [x] 6.3 The heading level is one below the heading above the insertion point.
- [x] 6.4 Blank lines produce no section and names are trimmed, with the spelling kept.
- [x] 6.5 A reserved name is written unchanged and named in what the command reports; a list without one is reported about at all.
- [x] 6.6 The restricting command encloses a selection unchanged, and with nothing selected restricts nothing that was already there.
- [x] 6.7 Both commands are in the context menu, by the check that reads the registry rather than a list written down. No new check: the one `plugin-insert-commands` wrote asks Obsidian which commands this plugin registered and holds every one of them against the menu, so it covered these two the moment they existed.

## 7. Close it out

- [x] 7.1 Run `npm run test:obsidian`; green.
- [x] 7.2 Run `npm test`; green.
- [x] 7.3 Record the mirrored list of reserved names in `AI/architecture.md` §9, beside the directive grammar's own mirror.
- [x] 7.4 Update `README.md` in the plugin repository, including why the heading is inside the block.
