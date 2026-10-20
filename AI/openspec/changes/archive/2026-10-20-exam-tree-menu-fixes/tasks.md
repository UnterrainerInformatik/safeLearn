## 1. Menu

- [x] 1.1 `exam/client/pool-tree.js` `openMenu`: pass only existing entries to `replaceChildren`, so a category that is not empty gets no "null" text (D1)
- [x] 1.2 `exam/client/pool-tree.js` `openMenu`: build New question with `entry("sl-exam-tree-new-question", …)` as a `<button>` that goes to `this.newQuestionAddress(node.id)` by `location.assign` (D2); adjust the file's head comment if it calls it a link
- [x] 1.3 `css/exam.css`: remove the `#markdown-content a.sl-exam-tree-menu-item` selectors (and the `:hover` one) now that no `<a>` entry exists (D3)

## 2. Tests

- [x] 2.1 `test/exam.test.js`: for a category with questions, assert the open menu's `textContent` has no `null` and its entries are New question, New subcategory…, Rename…
- [x] 2.2 `test/exam.test.js`: assert the New question entry is a `button` with the same computed colour and `text-decoration` as New subcategory…, and that choosing it opens `/exam/pool/questions/new?category=<id>`
- [x] 2.3 Run the exam test suite and the linter

## 3. Docs

- [x] 3.1 `docs-exam-module.md` and `AI/architecture.md`: nothing to change unless they call New question a link; check and adjust
