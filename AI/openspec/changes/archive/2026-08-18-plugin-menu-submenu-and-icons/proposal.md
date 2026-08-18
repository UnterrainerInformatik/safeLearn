Source proposal: `AI/proposals/plugin-menu-submenu-and-icons.md`

## Why

The editor's context menu belongs to Obsidian, and this plugin writes five entries into it. They stand together — `setSection("safelearn")` sees to that — but they stand at the level of everything else: five full-length lines in a menu of about a dozen. Each one is something a teacher reaches for now and then, and all five are in the way every time somebody right-clicks to copy a word.

They are long because their words were chosen for the command palette, where a command has nothing to explain it but its own name. *Insert side-by-side block with a chosen number of columns* is right there and reads like an apology in a menu that has already said whose commands these are.

Obsidian's own menu shows the shape this should have. **Format** is one entry carrying `lucide-paintbrush`, **Table** is one entry carrying `lucide-table`, and each opens a submenu. The plugin's five lines are the only run of bare text in it — which is what makes them look like something that was pasted in rather than something that belongs.

## What Changes

- **One entry, `SafeLearn`, with everything under it.** A single item in the menu Obsidian owns, its five commands one level down. Somebody who wants none of this reads one line instead of five.
- **Every entry carries an icon**, the parent included: `graduation-cap` for `SafeLearn`, then `columns`, `layout-grid`, `presentation`, `users` and `lock`. All six are in the Lucide set Obsidian ships — the same family `obsidian.js` already draws the server's own icons from through `lucide-static`, so this is not a namespace somebody has to invent. No entry is left without one: Obsidian aligns titles at the icon column, so a single missing icon is a hole rather than a restraint.
- **The names get shorter once, for both surfaces.** *Insert side-by-side block* becomes *Side-by-side block*, and so on down the list. The palette loses nothing by it — Obsidian prefixes a plugin's commands with the plugin's name, so it still reads *SafeLearn Formatter: Side-by-side block*, and the words the shortening removes are exactly the ones the prefix already supplies. One name per command means no second label that can go stale against the first, and the check that pairs the two surfaces keeps working by name.
- **No id changes**, so a hotkey somebody bound survives the renaming. A hotkey is bound to the command's id; only what is written on it changes.
- **The nesting and the icon belong to the one list**, not beside it. `AUTHORING_COMMANDS` gains an `icon` per entry and stays the single description both surfaces are built from. Splitting it in two is the one thing this change must not do: the whole point of that list is that no command can exist in one surface and not the other.
- **This reverses a decision made when the commands were written**, on new evidence. `plugin-insert-commands` recorded that a submenu was considered and dropped because `MenuItem.setSubmenu` is not part of Obsidian's published API. That is still true of the typings, and it is not true of the application: the installed Obsidian defines `setSubmenu` on `MenuItem` and builds its own **Format** and **Table** submenus with it. The change takes the undocumented call and pays for it — a guarded fallback to today's flat section, so that a version without it produces the menu we have now rather than a context menu that throws while it is being built.
- **The two things that read that menu have to open the submenu.** The harness's `editorMenuItems` and the screenshot tool's `openEditorMenu` both read `.menu .menu-item .menu-item-title`, and both address entries that will no longer be there when the menu opens. Neither is a nicety attached to this change: until they open the submenu, the run is red and the screenshot documents a menu the plugin no longer fills.

## Capabilities

### Modified Capabilities

- `plugin-authoring-commands`: the requirement that every command is reachable from the palette and from the editor's context menu changes what it asks of the menu. It says today that the entries stand together as a group of their own — a section — while its scenario already says *under a single entry of its own*, which is what a submenu is and what a section is not. The requirement is rewritten so the two agree on the submenu, gains that each entry is shown with an icon, and gains that the guarantee does not depend on the undocumented call: where the application cannot nest, the commands are still all there.

## Impact

- **`main.ts` in the plugin repository** (through the gitignored `AI/plugin` link): the `editor-menu` subscription in `onload`, the `AuthoringCommand` type and the five `name` fields in `AUTHORING_COMMANDS`. Nothing about what any command writes into a document is touched.
- **`test/obsidian/harness.js`**: `editorMenuItems` opens the submenu before reading, and stops treating an item with no title as a match for everything — `command.name.endsWith("")` is true of every command, which is the one way this check could go quiet instead of red.
- **`test/obsidian/plugin.test.js`**: the existing check keeps its claim and gains what the change adds — that the entries are one level down under a single entry, and that each is shown with an icon.
- **`tools/obsidian-screenshots.mjs`**: `openEditorMenu` opens the submenu and insists on the five titles there; the `menu` capture has to frame both menus, since `extra: ".menu"` addresses one of what will be two.
- **`AI/plugin/assets/menu.png` and `md/assets/plugin-menu.png`**: the picture is re-taken, and this one *is* copied into the documentation.
- **`docs-obsidian.md`** and **`AI/plugin/README.md`**: both say "right-click in the editor" and then table the five commands by name. The names change, and the sentence gains where they now are.
- **`AI/architecture.md` §9**: one line under *Code-level observations*, where the plugin's other divergences already stand — that the submenu is built with a call the running Obsidian has and the published typings do not.
- **Not `test/coverage-map.json`**: it records the checks under `test/` and `test/checks/`, and the plugin's suite lives under `test/obsidian/`.
- **No server file, and no corpus file.** Nothing here is about what the server does with a document.
