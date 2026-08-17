## 1. Tell the two ends of a block apart

- [x] 1.1 Have `resolveBlocks` report whether it closed a block or ran into the end of the document, rather than leaving `Block.to` to mean either. Set it for both block kinds, so the field does not mean one thing for a permission block and another for a side-by-side one.
- [x] 1.2 Have `markLines` hand `buildDecorations` the lines that close a permission block, out of the walk it already does. Not a rule the decoration builder applies again — one walk, one answer about where a block ends.

## 2. Take the marker off the screen

- [x] 2.1 Replace a closing marker's line with nothing while it is untouched, by the rule the directive line follows: a `Decoration.replace` lifted by `isTouched`, with no widget in it.
- [x] 2.2 Leave the range non-atomic, so the line can be entered. An unreachable closing marker is a restriction that cannot be taken back.
- [x] 2.3 Leave the line's block classes alone, so the frame still closes its floor on it.

## 3. Say it in checks

- [x] 3.1 Give the harness a way to name the last line holding a needle. `@@@` stands on both of a block's markers, and a check that means the closing one and reaches the opening one passes against a plugin that does nothing to either.
- [x] 3.2 At rest: neither marker is on screen, the block has exactly one floor, and the element carrying it holds no text — text still there would be a marker hidden by the stylesheet rather than replaced.
- [x] 3.3 With the cursor in the line: the marker's characters are back, the document is unchanged, and the directive line above is still shown as its heading.
- [x] 3.4 With the cursor moved off again: the line is blank once more.
- [x] 3.5 A block that is never closed keeps its last line, because that line is somebody's text.

## 4. Close it out

- [x] 4.1 Run `npm run test:obsidian`; green. 73 checks, including the three added here.
- [x] 4.2 Run `npm test`; green. `test/directive-grammar.test.js` loads the plugin's source into a context of its own, so anything new evaluated at load time has to be answerable by its stubs.
- [x] 4.3 Update `README.md` in the plugin repository, where the directive line's behavior is described. What a teacher sees changed.
- [x] 4.4 Record in `AI/architecture.md` §9 whatever this accepts rather than repairs, and drop the entry if it accepts nothing.
- [x] 4.5 Release the plugin: version at all three places, push, tag, build, GitHub release with the three assets.

### Notes on 4.4

`AI/architecture.md` §9 gained no entry. The change accepts nothing it could
have repaired: the marker is hidden rather than deleted, the line stays
reachable, and the one case where the old behavior was right — a block that was
never closed — is decided by the walk rather than left to chance. The one thing
worth knowing about the result is what a teacher sees, and that is in the
plugin's `README.md` rather than in the architecture record.

### Notes on 4.5

Released as `1.0.5`, "A block that closes on a blank line". The tag names the
commit that carries the version at all three places, and the release holds
`main.js`, `manifest.json` and `styles.css`.
