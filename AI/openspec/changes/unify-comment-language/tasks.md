## 1. The two functions in `obsidian.js`

- [ ] 1.1 `preprocessSideBySide` (`obsidian.js:813-834`): replace `// Regex für kompletten Block` (`:818`) and `// Jede Spalte in divs packen` (`:829`). Both label what the line beside them already shows, so say what is not evident instead — that the three markers are matched as one block so that a `##separator` outside a block is left alone, and that each column is wrapped with blank lines around it because the content is still Markdown at this point and has to stay parseable inside the `div`.
- [ ] 1.2 `postprocessFragments` (`:842-901`): replace `// Reset bei h2 oder h3` (`:862`) with what the reset means — a fragment index runs within a heading section, so every `H2` or `H3` starts the numbering again and closes the section that was open.
- [ ] 1.3 Replace `// Fragmentmarker` (`:867`) with what meeting the marker does: it is the comment node `preprocessFragments` left behind, it advances the index, it opens the section from which nodes are wrapped, and it is removed so it does not reach the browser.
- [ ] 1.4 Replace `// Text-Node` (`:880`) and `// Element-Node` (`:890`) with one comment above the pair explaining why the branches differ: a text node has no element to carry the class, so it is replaced by a `span`; an element keeps its identity, takes the class and the index, and is recursed into. Read the function before writing this (design Risks) — the comment is a claim about behavior, not a label.
- [ ] 1.5 Replace the inline `// Rekursiv in Tiefe gehen` (`:894`), or drop it if 1.4's comment has already said it.
- [ ] 1.6 Run `npm test`. `test/checks/rendering.js` covers fragment indices and side-by-side columns, so a run confirms nothing beside the comments moved.

## 2. The banner in `app.js`

- [ ] 2.1 Delete `// Node.js Beispiel` (`app.js:169`). The `// --- SSE Hot Reload ---` line above it already names the section; the deleted line was never about anything (design Decision 1).

## 3. Write the convention down

- [ ] 3.1 Add a short section to `docs-building.md`, in the form its existing short sections use ("The Node Line", "Sessions Live In The Container"): the source, its identifiers, its comments and the `docs-*` files are English, because this project is forked and run by people who did not write it.
- [ ] 3.2 Name the exemptions in the same section (design Decision 3): `md/` is teaching material in the language it is taught in; hand-written proposals under `AI/` and their archived originals keep the author's own words; conversation is whatever the participants speak.
- [ ] 3.3 State that no automated check enforces this and why — every cheap detector either catches one case in eight or reports English as German (design Decision 2). A reader should not go looking for the linter that would have caught it.
- [ ] 3.4 Confirm `README.md` already points at the file, so a contributor reaches the rule from the entry point rather than by finding it. The rule does not live in `AI/architecture.md` alone because that document analyses the code rather than instructing a contributor (design Context) — not because `AI/` is unreachable, which it is not.

## 4. Confirm the eight were all of them

- [ ] 4.1 Repeat all three searches from design Context over the current tree — diacritics across every source-like file outside `node_modules`, every comment line in the five root source files, and a pass over `obsidian-page.js`, `utils.js`, `middlewares/`, `test/` and `css/`. Record what each returns now.
- [ ] 4.2 If a ninth turns up, translate it here and add it to the proposal's table rather than leaving the table wrong.

## 5. Settle the observation

- [ ] 5.1 Strike the mixed-comment-languages Observation in `AI/architecture.md` section 9 in the established form, naming this change, where the convention is now written down, and that nothing enforces it mechanically by decision.
- [ ] 5.2 Run `npm test` one final time.
