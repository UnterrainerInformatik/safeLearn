## 1. Establish what the running Obsidian actually offers

- [x] 1.1 In the running application, confirm `setSubmenu` is a function on the object `Menu.addItem` hands out, and that the item it is called on gains `has-submenu`. Everything below rests on a call the typings do not declare, so it is established against the app before it is written into the plugin.
- [x] 1.2 Confirm all six icon names against `getIconIds()` in the same session: `graduation-cap`, `columns`, `layout-grid`, `presentation`, `users`, `lock`. Obsidian ships a frozen subset of Lucide — `columns-2`, Lucide's current name for the first of them, is not in it — so the library's catalogue is not evidence.
- [x] 1.3 Replace any of the six that is missing with a name from that same list, and say in `main.ts` why the entry carries the icon it does rather than the obvious one.

## 2. The menu the plugin builds

- [x] 2.1 Add the `setSubmenu` declaration to `main.ts` as a module augmentation on `MenuItem`, in one place, with a comment saying it is API Obsidian has but does not publish. Not `as any` at the call site: that silences the rest of the expression along with the one thing it is for.
- [x] 2.2 Give `AuthoringCommand` an `icon`, and fill it in for the five entries from the table in `design.md`. It belongs to the list, not beside it — the list stays the one description both surfaces are built from.
- [x] 2.3 Rewrite the `editor-menu` subscription: one item titled `SafeLearn`, carrying `graduation-cap`, keeping `setSection(MENU_SECTION)`, with the five commands added to the menu `setSubmenu()` returns. Each of those carries its own icon and no section — inside a menu of their own a section only draws separators.
- [x] 2.4 Guard the call with `typeof item.setSubmenu === "function"` and fall back to today's flat section. Not for an old Obsidian — `minAppVersion` is 1.5.7 — but because this runs while a menu is being assembled for somebody who right-clicked, and a throw there can cost entries that other plugins were about to add.
- [x] 2.5 Shorten the five `name` fields as the table in `design.md` gives them, with `…` on the two that open a dialog. Leave every `id` alone: an id is what a hotkey binds to and what the screenshot tool executes, and nothing shows it to anybody.
- [x] 2.6 Change nothing below the list — what a command writes, what it asks, where it leaves the cursor. If a diff reaches into an insertion function, it has gone too far.

## 3. Give the harness the submenu

- [x] 3.1 Teach `editorMenuItems` to open the submenu after the context menu is up: find `.menu-item.has-submenu`, dispatch a mouse-over at it, and wait for the second `.menu`. Dispatched at the item rather than the menu being built by hand, for the reason already written above that helper — a menu a check assembled would be reachable whether the plugin subscribed to anything or not.
- [x] 3.2 Drop empty titles from what it returns. `command.name.endsWith("")` is true of every command, so one menu item without text would let the palette-versus-menu check pass having established nothing. That is not the state today; it is one filter to make it impossible.
- [x] 3.3 Add a helper reporting what the plugin put in the menu's top level and what stands under its entry, and one reporting whether each item has a drawn icon — an `svg` in the item's icon element, not the name that was passed in. A name the set does not know draws nothing and raises nothing, so only the DOM knows.
- [x] 3.4 Leave the failure messages of these helpers naming what they looked for and where. A submenu that did not open must read as that, not as a menu that lost the commands.

## 4. Say it in checks

- [x] 4.1 Keep the existing check — every command Obsidian holds for this plugin is reachable from the context menu — and let it now pass through the submenu. Its claim is unchanged; where it looks is what moved.
- [x] 4.2 Check that the plugin contributes exactly one entry to the menu's top level, and that all five commands stand under it. Five lines becoming one is the whole point of the change, so it is the thing to assert.
- [x] 4.3 Check that every one of the six entries is drawn with an icon, read from the DOM.
- [x] 4.4 Check that the palette still holds all five under their new names, so that a renaming which reaches only one surface fails here.

## 5. The picture and the pages

- [x] 5.1 In `tools/obsidian-screenshots.mjs`, open the submenu in `openEditorMenu` and insist on the five titles there — with the new names. A shot of a menu the plugin no longer fills is the picture nobody notices is wrong.
- [x] 5.2 Make `capture`'s `extra` match with `querySelectorAll` and union every match into the crop. With two `.menu` elements the current `querySelector` frames the parent and cuts the submenu off at the edge, silently. Single-element callers are unaffected.
- [x] 5.3 Re-take the shots: `npm run docs:screenshots`. The `menu` shot is copied into the documentation, so this one does go stale if it is skipped.
- [x] 5.4 Update the command table and the sentence above it in `docs-obsidian.md` and in the plugin's `README.md`: the names changed, and where they are reached changed. Both say "right-click in the editor" and then name all five.

## 6. Close it out

- [x] 6.1 Run `npm run test:obsidian`; green, including the new checks.
- [ ] 6.2 Run `npm test`; green. `test/directive-grammar.test.js` loads the plugin's source into a context of its own, and a `declare module` block is erased before it ever gets there — but that file has twice been the thing an import in `main.ts` broke, so it is run rather than reasoned about.
- [x] 6.3 Open the menu by hand and look at it, in a second theme as well. Whether *Section per name…* reads as bare without the word *restricted* is a judgement to make there; `Restricted section per name…` is the fallback, and taking it means the tables in `design.md`, the documentation and the README say so too.
- [x] 6.4 Commit both sides. `main.ts`, `README.md` and `assets/menu.png` are the plugin repository through the `AI/plugin` link; the harness, the screenshot tool, `docs-obsidian.md` and `md/assets/plugin-menu.png` are this one.
- [x] 6.5 Record it in `AI/architecture.md` §9, under *Code-level observations*: the plugin builds its submenu with `MenuItem.setSubmenu`, which the running Obsidian has and the published typings do not, declared through an augmentation and guarded at the call. That section already carries the plugin's other divergences, and this is one a person reading `main.ts` against the API docs would otherwise meet as a bug.
- [x] 6.6 Nothing for `test/coverage-map.json`: it records the checks under `test/` and `test/checks/`, and this suite lives under `test/obsidian/`.
