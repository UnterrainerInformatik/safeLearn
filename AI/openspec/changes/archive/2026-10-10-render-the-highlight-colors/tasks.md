## 1. Rendering

- [x] 1.1 Add `highlightColors` (emoji → colour name) and `highlightExtension`, a `marked` inline
      extension emitting `<mark class="sl-mark[ sl-mark-<colour>]">`, to `obsidian.js`
      (design.md — A `marked` inline extension; Where the grammar draws its edges)
- [x] 1.2 Register it on `markedLight` and `markedDark` in `app.js`
- [x] 1.3 Try it in isolation against plain, coloured, VS16, nested formatting, inline code, fenced code,
      `a === b == c`, `== ==`, `==a= b==`, a line break and an unknown emoji

## 2. Styling

- [x] 2.1 `css/highlights.css`: default and six tints from Obsidian's base colours, `color: inherit`,
      dark variants under `.dark-mode` and `.reveal` (design.md — Class names and tints)
- [x] 2.2 `@import` it from `css/main.css` and link it from `wrapInReveal`
      (design.md — One stylesheet, linked from both chains)

## 3. Verification

- [x] 3.1 Add a "Test Highlights" section to `md/test-md-file.md`: the plain form, all six colours,
      bold inside one, a code span and a `===` run
- [x] 3.2 Add a check to `test/checks/rendering.js`: a mark per highlight, the emoji not in the text,
      seven distinct backgrounds, the surrounding text colour kept, bold rendered inside, the code span
      and the `===` run left alone
- [x] 3.3 Name `css/highlights.css` under the rendering check in `test/coverage-map.json`
- [x] 3.4 `npm test`: the new check passes; the remaining failures are the six directory-search checks,
      which fail identically on the unchanged tree (local directory credentials, see
      `AI/memory/directory-service-credentials-invalid.md`)

## 4. Documentation

- [x] 4.1 A "Highlights And Their Colors" section in `docs-obsidian.md`
- [x] 4.2 `AI/architecture.md`: feature table row, the pipeline note at `marked.parse`, and the
      stylesheet inventory (which was already one file behind before this change)
