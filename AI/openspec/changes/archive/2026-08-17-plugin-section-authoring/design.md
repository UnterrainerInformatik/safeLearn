## Context

See `proposal.md` — Why. What this builds on:

- `plugin-insert-commands` left a list of authoring commands that `onload` turns into palette entries and context-menu items. These are two more entries in it, which is what the list was built for.
- `writeLines` in the plugin already inserts a run of lines on lines of their own, breaking the line where the cursor stands mid-line, and leaves the cursor at a named line of what it wrote.
- `utils.js` `hasRoles` adds the session's display name to the role set as a role, **except** when it equals one of `admin`, `teacher`, `teachers`, `student`, `students` — `namesReservedForRoles`. Such a name is dropped with a warning and never enters the set. All comparisons are trimmed and lowercased.
- `obsidian.js` `removeForbiddenContent` replaces the text **between** the markers. Everything outside them is left where it is, for every reader.

## Goals / Non-Goals

**Goals:**

- One restricted section per name, in the order the names were given, correct without being read over.
- A generated document that does not leak the list it was generated from.
- Names as the author wrote them.
- Nothing that has to be undone when the directory arrives.

**Non-Goals:**

- Fetching names from anywhere. The list is given to the command. `plugin-admin-api-backend` and `plugin-admin-directory-ui` are where a directory comes from, and both are blocked on questions this change does not touch.
- Validating that a name exists. The plugin has no directory to ask, and inventing one would be a second source of truth beside the one that is coming.
- Correcting a name that collides with a built-in role. Settled in the source proposal: the command writes what it was given.

## Decisions

### The heading stands inside the block, and that is a data-protection decision

`removeForbiddenContent` replaces what is between `@@@ <name>` and `@@@` with the empty string, per reader. Whatever stands outside those markers stands for everyone.

So a document built as

```markdown
### Stu Dent
@@@ Stu Dent
…
@@@
```

shows every student the name of every other student, on a page whose whole purpose was that they see only their own. The heading therefore goes **inside**:

```markdown
@@@ Stu Dent
### Stu Dent

@@@
```

A reader who is not addressed sees an empty region where the block was; a reader who is sees their own name at the top of their own section.

**The level is one below the last heading above the insertion point**, capped at six, and level one where there is no heading above at all. That keeps the generated sections underneath whatever chapter they were inserted into, rather than at a level chosen by the command.

### The names come from the command, one per line

A text field in the command, which is what a class list pasted out of a mail or a spreadsheet looks like.

**Not from the selected text**: a command that reads the document to decide what to write into it makes selecting the wrong thing a silent way to generate the wrong document.

**Not from a file in the vault**: settled in the source proposal. It would be a second source of truth beside the directory that is coming, and the two would be free to disagree about who is in a class — which is exactly the question the directory exists to answer.

Empty lines are skipped and each name is trimmed. Everything else about the name is left alone: the server's comparison is lowercased, so the spelling changes nothing about who can read the block, and a document of lowercased personal names reads badly.

### A reserved name is written as given, and reported

`hasRoles` drops a display name equal to `admin`, `teacher`, `teachers`, `student` or `students` rather than adding it to the role set. So a section generated for a student whose display name is `Students` is not addressed to that person at all — it is addressed to the role, and every student in the school reads it.

The source proposal settles that the command writes the name anyway: it inserts what it was given and decides nothing. It also says the collision becomes visible through the editor's marking, which shows `Students` as a role rather than as a person.

**That marking does not exist, and it should not be built.** The plugin marks an entry as an entry; it cannot tell `4bhif` from `Stu Dent`, because to the server they are the same kind of thing. The only distinction it *could* draw is "this is one of the five", and drawing it would mean marking every ordinary `@@@ teacher` as a collision — noise on the most common directive in the corpus, for the sake of a case that is rare.

So the report goes where the intent is known: the command has just been handed a list of *people*, so it can say which of them the server will not read as people. It names them once, after inserting, and changes nothing. Nowhere else in the plugin is that inference available.

### With no selection, a restricting command writes an empty block

The command that wraps a selection in a directive encloses the selection whole, the way the side-by-side commands do. With nothing selected it writes the directive, a line to write in and the closing marker, and leaves the cursor on that line — rather than guessing at the paragraph the cursor happens to be in.

**Why not the surrounding paragraph:** a restriction placed around content a person did not point at is a restriction over the wrong text, and the failure mode is that somebody does not see something they should. The fragment command does guess at the paragraph, and the difference is that a misplaced fragment marker is visible the next time the deck is opened, while a misplaced restriction is invisible to the person who wrote it.

### The five reserved names are mirrored, not imported

The plugin ships to Obsidian as a standalone bundle with no safeLearn checkout anywhere near it, so the list is written out in the plugin's recognition block beside the other rules taken from the server. It is the same arrangement as the directive grammar, and it carries the same risk of drifting — recorded here, and left where a reader comparing the two implementations meets it.

## Risks / Trade-offs

- **The list is pasted with a stray blank line or trailing spaces and produces an empty or badly spelled section** → blank lines are skipped and names are trimmed; nothing else is guessed at. A misspelled name produces a section nobody can read, which is the safe direction: the failure is that somebody sees too little, and they say so.
- **The mirrored list of reserved names drifts from `utils.js`** → recorded above and in `AI/architecture.md` §9 with the directive grammar's own mirror, which has an oracle check holding it against the server. Five string constants that have not changed since the feature existed do not earn one of their own, and the drift is stated rather than left to be found.
- **A teacher generates sections and does not read the report** → the report names the collisions and the document still says what it says. Nothing here can make a document safe that a person did not read; what it can do is make the one fact that is not visible in the text visible once, at the moment it is known.
- **The heading inside the block reads oddly to somebody who expected it above** → it is the difference between a page that leaks a class list and one that does not, and it is written down in the plugin's README where a person meets it.
