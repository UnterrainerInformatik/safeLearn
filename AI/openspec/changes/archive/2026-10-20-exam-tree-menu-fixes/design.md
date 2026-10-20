## Context

`TreeView.openMenu` (`exam/client/pool-tree.js:281`) builds the tree's one `role=menu` anew on every open:

```js
this.menu.replaceChildren(
  h("a", { role: "menuitem", …, class: "sl-exam-tree-menu-item sl-exam-tree-new-question", href: this.newQuestionAddress(node.id) }, …),
  entry("sl-exam-tree-add", …),
  entry("sl-exam-tree-rename", …),
  this.menuDelete            // null for a category that is not empty
);
```

- `Element.replaceChildren` converts every argument that is not a `Node` to a string, so `null` becomes a text node "null". The module's `h()` skips `null` children, but `replaceChildren` is the plain DOM method.
- New question is an `<a href>`. `css/exam.css:1641` tries to reset it with `#markdown-content a.sl-exam-tree-menu-item`, but the page's link rules (colour, underline, `:visited`, dark mode) still win in places, so it reads as a link while the other entries are `<button>`s.

## Goals / Non-Goals

**Goals:** no stray text in the menu; New question looks and behaves like the other entries.

**Non-Goals:** changing the menu's entries, order, placement or keyboard handling; changing **New question** beside the search in the pool (it is a module button and stays as is).

## Decisions

- **D1 Drop `null` before `replaceChildren`.** Pass `...[…].filter(Boolean)` or only append `this.menuDelete` when it exists. Smallest fix, keeps `this.menuDelete` as the armed-Delete handle.
- **D2 New question becomes a `<button>` from the same `entry()` helper**, whose action navigates with `location.assign(this.newQuestionAddress(node.id))`. Alternative considered: keep `<a>` and harden the CSS against every link rule (`:link`, `:visited`, dark mode). Rejected: the module's convention (`exam-ui-conventions`, "Actions are buttons in one style") already says links remain only for pages to read, and one element type means one set of rules. Lost: middle-click / "open in new tab" on this entry; acceptable, the editor is reached in the same tab everywhere else in the tree.
- **D3 Remove the CSS that only existed for the `<a>` entry** (`#markdown-content a.sl-exam-tree-menu-item` and its `:hover`) once nothing renders it.
- Keep the class `sl-exam-tree-new-question` so the existing tests' selectors still match.

## Risks / Trade-offs

- [Tests click the entry expecting a navigation] → `location.assign` navigates the same way; the browser tests wait for the editor's URL as before.
