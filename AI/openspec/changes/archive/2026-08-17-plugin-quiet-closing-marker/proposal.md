## Why

The plugin has spent three changes taking its tags off the screen. A directive line stands as the heading of the block it opens; a fragment stands as an icon; the reading view shows neither. One marker was left behind: the `@@@` that closes a permission block still stands in the editor as its own characters.

It is the one that has least to say. The directive names an audience, so its heading carries something — the entries, their windows, what the server will do with each. The closing marker names nothing. It says the block ends here, and the frame drawn around the block already says that, on the same line, with an edge a person reads without looking for it.

So it is three characters of punctuation sitting inside a teacher's text, in the one view a teacher writes in, saying a second time what the box around it already said.

The reason it was left is worth stating, because it is the reason the repair is not simply deletion: the marker has to stay reachable. It is the only way there is to open the block up again — a person who wants the restriction gone deletes that line, and a marker that could not be reached would make the block permanent.

## What Changes

- **The marker that closes a permission block is shown as the blank line the frame closes on.** No characters, and the line stays where it is: the block still ends where the document ends it, and the frame still draws its floor there.
- **The marker comes back on contact**, by the rule the directive line above it already follows — the cursor resting in the line, or a selection running across it. What comes back are the characters the document already held; nothing is written into anyone's file.
- **A block that was never closed is left alone.** Its last line is the end of the document rather than a marker, and that line holds somebody's text.
- **The side-by-side markers are not touched.** `##side-by-side-start`, `##separator` and `##side-by-side-end` are three different statements about three different lines, and quieting them is a question about that block kind rather than a consequence of this one.

## Capabilities

### Modified Capabilities

- `plugin-editor-decorations`: gains a requirement for the closing marker. The capability today says what happens to a directive line and to a fragment while nothing stands in them, and says nothing about the marker at the other end of the same block — which is why that marker was the one thing left showing its own characters. The existing requirement *A directive line is shown as the heading of the block it opens* is unchanged; this one states the same rule for a marker that has no heading to leave behind.

## Impact

- **`main.ts` in the plugin repository** (through the gitignored `AI/plugin` symlink): `resolveBlocks` reports whether it closed a block or ran into the end of the document, `markLines` passes on which lines are closing markers, and `buildDecorations` replaces such a line while it is untouched. The mechanism is the one already there for the directive line — a `Decoration.replace` lifted by `isTouched` — with no widget in it.
- **`test/obsidian/plugin.test.js`**: new checks for the three states — at rest, with the cursor in the line, and in a block that was never closed.
- **`test/obsidian/harness.js`**: `moveCursorInto` gains a way to name the *last* line holding a needle. `@@@` stands on both of a block's markers, and a check that means the closing one and reaches the opening one passes against a plugin that does nothing to either.
- **`README.md` in the plugin repository**: what a teacher sees changed, so it is described where the directive line's behavior is described.
- **No server file is read or changed**, and the reading view is untouched — it never showed the marker to begin with.
