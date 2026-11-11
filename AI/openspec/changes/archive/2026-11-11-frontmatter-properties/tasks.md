## 1. Splitter

- [x] 1.1 Add `yaml` to `package.json` dependencies; verify `npm install` succeeds and `node -e "import('yaml')"` loads it
- [x] 1.2 `splitFrontmatter(text)` in `obsidian.js` per D1/D2: leading invisible marks, opening/closing `---` (trailing whitespace, CRLF), `core` schema, ordered `[name, value]` list or `null`, unreadable block stripped and logged with the path; unit tests in a new `test/frontmatter.test.js` cover the spec scenarios (homework file, later `---`, unclosed block, broken YAML, CRLF, dates stay strings) and pass
- [x] 1.3 Register the new test and source in `test/coverage-map.json`; `npm test` coverage check passes

## 2. Every read site

- [x] 2.1 `sanitizeAndParseMarkdown` and `renderHandout` (`app.js`) call `splitFrontmatter` first and read the directive from line 1 of the body; `sanitizeAndParseMarkdown` returns `{ html, properties }` and its callers are adapted (D3); verify a fixture `md/test-frontmatter.md` (frontmatter + `@@@ teacher`) is refused for the student demo account and renders without the block for the teacher
- [x] 2.2 `readCorpusFile`, `answerFromFile`, `referencesVisibly` (`obsidian.js`) call `splitFrontmatter` first; verify the fixture is absent from the student's navigation and search and that its handout/attachment checks agree with the page
- [x] 2.3 Scan `safeLearn/md`, secureLectures `md/` and `~/nextcloud/secureLectures` for files whose first line is `---`; report every file that would now lose content (Risk 1), and confirm with `npm test` that the existing corpus renders unchanged

## 3. Search

- [x] 3.1 `readCorpusFile` keeps `propertyText` (values only, list items one per line); `candidatePaths` considers it; `answerFromFile` appends the values as heading-less segments, one per value (D4); content checks: a teacher finds the fixture by a `themen` item with that item as snippet, a search for a property name does not find it, a student finds nothing

## 4. Views

- [x] 4.1 Page view: properties button in the top bar and `<dialog>` message (D5), only when properties exist, values escaped; i18n keys `app.page.properties.button` / `.title` / `.close` in `i18n/en.json` and `i18n/de.json`; `i18n-catalog.test.js` passes; browser check opens the dialog on the fixture, sees all properties and a `<b>` value as literal text, and sees no button on a file without frontmatter
- [x] 4.2 Header/footer in page and document view (D6), escaped, only for string/number values; browser check sees the fixture's footer below the content, a header-only file shows no footer, a list-valued footer shows nothing
- [x] 4.3 Header/footer overlay in the presentation view (D6), no properties button; browser check sees the footer on the first and last slide, no slide made of property lines, and the `presentation-view` "every slide fits" check still passes; check print-to-PDF and clone per slide in print mode if needed

## 5. Wrap-up

- [x] 5.1 Document frontmatter handling (stripping, `@@@` on the line after it, `header`/`footer`, search) in `docs-render-pipeline.md` and `docs-permissions.md`, in English
- [x] 5.2 Full `npm test` green (re-run known flaky checks once before treating them as failures)
