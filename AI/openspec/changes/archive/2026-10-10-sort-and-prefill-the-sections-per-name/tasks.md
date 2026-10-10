## 1. Server: name parts in the search result

- [x] 1.1 `middlewares/directory-service.js`: `searchDirectory()` maps each user to `{ name, firstName, lastName, roles }`, with missing parts as `""`, for both the empty and the matching query (design.md — The server returns the parts, not a sort key)
- [x] 1.2 `test/directory-service.test.js`: a result carries both parts, a two-word surname comes through whole, and a missing surname comes through as `""` while `name` is unchanged
- [x] 1.3 `test/checks/directory-search.js`: the live check's field assertion admits exactly `name`, `firstName`, `lastName`, `roles`

## 2. Plugin: ordering at confirm

- [x] 2.1 `searchDirectory()` passes `firstName`/`lastName` through when they are strings
- [x] 2.2 `NameListModal` holds the chosen people as `{ name, firstName?, lastName? }`. The chosen list, the count, deduplication and taking someone back out still key on `name`, and the display order stays as chosen
- [x] 2.3 Pure `orderForWriting(chosen, typed)` using a module-level `Intl.Collator("de", { sensitivity: "base" })`. Called in `confirm` (design.md — Ordering lives in one pure function)

## 3. Plugin: content for every section

- [x] 3.1 Pure `sectionContentLines(raw)` (design.md — Normalising the content)
- [x] 3.2 `NameListModal` option `withSectionContent`: an optional, labelled second textarea below the names and above the confirmation. `onList(names, content)`. The per-name command passes `true`, "Restrict selection…" passes `false`
- [x] 3.3 `confirm` refuses content holding a line that matches `directiveOpeningPattern()`: a Notice, and the dialog stays open with its input
- [x] 3.4 `insertSectionsPerName(editor, names, contentLines)` writes the content into each section, with the cursor on the first content line (at its end, `writeLines`' convention)

## 4. Verification

- [x] 4.1 A unit test (pattern of `test/semester-table.test.js`, through `pluginFunction`) for `orderForWriting`: surname, then given name; umlaut and case; two-word surname; stable ties; parts missing falls back to the display name; typed names follow in their order and duplicates are dropped
- [x] 4.2 Unit tests for `sectionContentLines`: empty or whitespace gives `[""]`, one trailing line break is dropped, inner blank lines and indentation are kept, CRLF
- [x] 4.3 Obsidian run (`test/obsidian/plugin.test.js`): per-name sections with content (every section holds it, cursor on the first content line); content holding `@@@` is refused with nothing written; the restrict dialog shows no content field; the existing "in the order the list gave them" check for a typed list still holds
- [x] 4.4 `npm run build` in the plugin, then `npm test` in safeLearn: 251 of 257 pass. The six failures are the live directory-search checks, which fail on the unchanged tree too: the local directory-service credentials are invalid, so the instance's fetch dies at once (see `AI/memory/directory-service-credentials-invalid.md`). Their unit counterparts, including the new name-parts test, pass

## 5. Documentation

- [x] 5.1 Plugin `README.md`: "Restricted section per name…" writes chosen people in surname order and offers optional content for every section
- [x] 5.2 `docs-obsidian.md` and `AI/architecture.md`, where they describe the command or the directory search response

## 6. Ship

- [x] 6.1 safeLearn: commit and push; merge `public/master` into secureLectures and push
- [x] 6.2 Plugin: patch version bump at the three places, commit, push, tag, build, GitHub release with `main.js`, `manifest.json`, `styles.css` — released as 1.0.18
