## Context

Five entries, written flat into a menu the plugin does not own, with names written for a different surface. Everything about the shape this change wants is uncontroversial — Obsidian's own **Format** and **Table** entries are exactly it — and the whole difficulty sits in one sentence: the call that makes a submenu is not in Obsidian's published API.

That is not a new discovery. `plugin-insert-commands` looked at the same call, found it undeclared, and chose `setSection` for that reason. Reversing a decision that was made deliberately needs more than a preference about how a menu looks, so most of what follows is about what changed since — what the application actually does, what it costs to rely on it, and what happens on the day it stops being true.

The second half is the checks. Two of them read the menu by walking `.menu .menu-item .menu-item-title`, and both were written when everything the plugin adds stood one level up.

## Goals / Non-Goals

**Goals:**

- One entry for the plugin in the editor's context menu, its commands one level below it.
- An icon on every one of those entries, from the set Obsidian itself ships.
- Names short enough to read in a menu, without a second label maintained beside the first.
- The palette and the menu still built from one list, and still provably in agreement afterwards.
- A menu that survives the undocumented call disappearing.

**Non-Goals:**

- Changing what any command writes into a document, what it asks for, or where it leaves the cursor. Nothing below `AUTHORING_COMMANDS` is touched.
- Changing command ids. A hotkey somebody bound stays bound.
- Sections, submenus or icons anywhere else — the ribbon, the file menu, the settings tab. This is the editor's context menu.
- A settings option for any of it. Two ways to draw one menu is two menus to keep true.

## Decisions

### The submenu is `MenuItem.setSubmenu()`, declared once and guarded at the call

The application defines it. Read out of the installed Obsidian, `setSubmenu` adds `has-submenu` to the item's element, creates the submenu, puts a `menu-item-icon mod-submenu` carrying `lucide-chevron-right` into the item, makes the item's own click a no-op, and returns the new `Menu`. Obsidian's editor menu builds **Format** (`lucide-paintbrush`) and **Table** (`lucide-table`) with it. This is not a private corner being pried open; it is the mechanism the surrounding menu is made of.

The typings are the part that has not caught up: `obsidian` 1.8.7 declares `setTitle`, `setIcon`, `setSection` and `onClick` on `MenuItem`, and no `setSubmenu`. There are two ways to write the call. An `as any` at the call site is shorter, and silences every other mistake in the same expression along with the one thing it is for. A module augmentation —

```ts
declare module "obsidian" {
  interface MenuItem {
    setSubmenu(): Menu;
  }
}
```

— says in one place, in words, that this is API the typings do not carry, and leaves the rest of the expression checked. Take the augmentation.

Then guard it: `typeof item.setSubmenu === "function"` decides between the submenu and today's flat section. Not because an old Obsidian is expected — `minAppVersion` is already 1.5.7, and submenus are older than that — but because of *where* this code runs. It runs inside the `editor-menu` handler, while a menu is being assembled for somebody who just right-clicked. A `TypeError` thrown there is not a missing SafeLearn entry; it is a menu that may lose whatever was going to be added after us, in a place nobody would think to look for the cause. The fallback is the code that is there today, so the bad day produces the menu we have now.

### The parent keeps the section; the entries below it do not need one

`setSection(MENU_SECTION)` moves to the parent entry. A section is how an entry says where it belongs among Obsidian's own groups rather than landing wherever the order of subscription put it, and that question is still worth asking — of one entry now instead of five.

Inside the submenu it is not asked at all: those five are alone in a menu of their own, and a section there buys nothing but separators between them.

### Every entry carries an icon, and the icons are checked against the application

Obsidian lays a menu item out as an icon column and a title. An item without an icon does not sit further left; it leaves the column empty and its title indented past nothing. A menu where some rows carry an icon and some do not therefore looks broken in a way that neither *all* nor *none* does — which answers the source proposal's question about an entry with no obvious icon: it gets one anyway.

| Entry | Icon | Why |
| --- | --- | --- |
| `SafeLearn` | `graduation-cap` | The one icon in the set that says *school* rather than *some plugin*. |
| Side-by-side block | `columns` | What it makes. |
| Side-by-side, n columns… | `layout-grid` | The same family, for the one that can produce more than two. |
| Fragment marker | `presentation` | A fragment means nothing outside a deck; the icon says deck. |
| Restricted section per name… | `users` | It is about who there is. |
| Restrict selection… | `lock` | It is about what is closed. |

All six were confirmed present in the icon table of the installed Obsidian before being written down here, and that check is not a formality: Obsidian ships a *subset* of Lucide, frozen at the version it bundles. Lucide has since renamed `columns` to `columns-2`, and `columns-2` is not in the application. Finding a name on lucide.dev is not evidence that it is here. The apply step confirms all six against `getIconIds()` in the running app rather than against the table above.

### The names are shortened once, and the palette takes its context from the prefix

Obsidian shows a plugin's command as `<plugin name>: <command name>`, so the palette already says *SafeLearn Formatter:* before the command's own words begin. What the shortening removes — *Insert*, *a restricted … for each*, *to named readers* — is what that surface supplies anyway. One name per command: nothing can drift, and the check that pairs the palette with the menu keeps matching by name.

| id | Was | Is |
| --- | --- | --- |
| `insert-side-by-side` | Insert side-by-side block | Side-by-side block |
| `insert-side-by-side-columns` | Insert side-by-side block with a chosen number of columns | Side-by-side, n columns… |
| `insert-fragment` | Insert fragment marker | Fragment marker |
| `insert-sections-per-name` | Insert a restricted section for each name | Restricted section per name… |
| `restrict-selection` | Restrict the selection to named readers | Restrict selection… |

The trailing `…` is Obsidian's own convention for an entry that asks before it acts, and it is true of exactly the two commands that open a dialog.

The one word worth arguing about was *restricted*. The short form *Section per name…* drops it and leaves it to be carried by the `users` icon beside it, by the documentation table that says what each command writes, and by what the command visibly produces. Looked at in the open menu, in both themes, it read as bare: *Restricted section per name…* is what the entry says. It is the longest of the five and still shorter than what it replaces, and it is the one command of the five whose effect is a permission rather than a layout — which is the thing a menu should not make somebody infer from an icon.

Ids do not change. They are what a hotkey binds to and what `tools/obsidian-screenshots.mjs` executes; nothing shows them to anybody, so there is nothing to gain by touching them and a bound key to lose.

### What the checks have to do, and what today's check actually does

A submenu's items are not in the document until it is open — `setSubmenu()` builds a `Menu`, and a `Menu` attaches itself when it is shown. So a read of `.menu .menu-item .menu-item-title` taken right after the context menu opens finds Obsidian's own entries and our parent, and none of the five.

The source proposal expects the existing check to go quietly green on that. Read as written, it does not: it keeps every command whose name matches no visible title, which is all five, so the comparison fails and names them. That is the right outcome, and it is why the harness belongs to this change rather than to a follow-up — the run is red until `editorMenuItems` opens the submenu.

There is one way it *could* go quiet, and it is worth closing while we are here. Titles are read as `textContent ?? ""`, and `command.name.endsWith("")` is true of every command. A single menu item without text — from Obsidian, from another plugin, from a future entry that carries only an icon — would make the check pass having established nothing. Dropping empty titles in the harness costs one filter.

Opening the submenu: the parent is findable as `.menu-item.has-submenu`, which is the class the application puts there, and it opens on hover rather than on click — its own click is the no-op `setSubmenu` installed. So the harness dispatches a mouse-over at it and waits for a second `.menu` to appear, the same way `editorMenuItems` already dispatches the `contextmenu` event rather than building a menu by hand. Reading afterwards needs no change: both menus are in the document, and `.menu .menu-item .menu-item-title` across all of them is exactly the claim — every command reachable from the menu, wherever it stands.

What the change adds, the checks state separately: that the plugin contributes one top-level entry rather than five, that the five stand under it, and that each entry is shown with an icon. The icon is read as a rendered `svg` in the item's icon element, not as the name that was passed in — a name the icon set does not know produces a call that does nothing and an empty column, which is the failure worth catching, and only the DOM knows about it.

### The screenshot has to frame two menus

`capture(name, { extra })` widens the crop by `document.querySelector(extra)` — one element, and silently nothing when there is none. With a submenu open there are two `.menu` elements, and the one that gets framed is the parent. The picture would show the submenu cut off at the edge of the frame or missing altogether, and nothing would report it.

So `extra` is matched with `querySelectorAll` and every match unioned into the crop. That is what the parameter already means everywhere it is used, and it stays correct for the single-element case it was written for.

## Risks / Trade-offs

- **The call is undocumented and can be removed.** → The guard turns that from a broken context menu into today's flat one, and the plugin's own check fails loudly on the first run under such a version: it asserts the submenu, so it cannot pass by falling back.
- **The augmentation declares something the typings may later declare themselves.** → A future `obsidian` package that adds `setSubmenu` with the same signature merges silently; one with a different signature fails at compile time, which is where it should fail. Either way it is one block to delete.
- **`has-submenu` and `mod-submenu` are class names, not API.** → Only the harness and the screenshot tool depend on them, so a rename costs a red run and a one-line fix rather than a broken plugin.
- **The renaming changes what people read in the palette.** → Ids are untouched, so hotkeys and `executeCommandById` are unaffected; what changes is the words, and they get shorter without losing anything the prefix does not already say.
- **One more step to reach a command from the menu.** → That is the trade being made on purpose: five lines at every right-click, against one hover for the person who wants one of them. The palette and any bound hotkey stay one step, as before.
- **`AI/plugin` is a link into a repository of its own.** → `main.ts`, `README.md` and `assets/menu.png` are commits over there; `docs-obsidian.md`, the harness, the screenshot tool and `md/assets/plugin-menu.png` are commits here. The change is not done until both sides carry it.
