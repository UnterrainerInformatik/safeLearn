## 1. Remove the route

- [x] 1.1 `app.js`: delete `GET /convert`, `POST /convert` and `mdGetToHtml`, together with the comment block above the `POST` handler
- [x] 1.2 `app.js`: drop the `axios` import. Search the repository for other importers. If there are none, remove `axios` from `package.json` and `package-lock.json` (design.md, decision 4)
- [x] 1.3 `obsidian.js` `getTopBar`: drop the `/convert/` special case and always derive the title from `req.path`
- [x] 1.4 `obsidian.js`: in the `resolveFileVisibility` comment, name the page handler's re-parsing as the reason for taking a parsed directive and drop `/convert` and `mdGetToHtml`
- [x] 1.5 `index.html`: remove the two sample links to `localhost:8080/convert/?url=…`
- [x] 1.6 Delete `http/md.http`, which holds `/convert` requests only. Check that `httpyac.config*.cjs` does not reference it

## 2. Replace the harness probe

- [x] 2.1 Add the fixture `md/test-fileperms-nobody.md`, whose first line is `@@@ nobody-holds-this-role`, followed by a short body with a unique marker
- [x] 2.2 `test/checks/permissions.js`: add it to `restrictedFiles` (`directive: ["nobody-holds-this-role"]`), and update the file's header comment listing the fixtures it reads
- [x] 2.3 `test/checks/permissions.js`: in the `restrictedFiles` checks, assert that a file the session may see renders without its `@@@` directive line (design.md, decision 3)
- [x] 2.4 `test/checks/permissions.js`: delete the `convert` helper and the test "a posted body whose first line is a directive the session fails is refused" (section 3.5a)
- [x] 2.5 `test/coverage-map.json`: drop the `/convert` sentence from the `permissions.js` entry and add `md/test-fileperms-nobody.md` to its `corpus`

## 3. Guard against its return

- [x] 3.1 `test/checks/deployment-surface.js`: start a local listener that records hits. Request `GET /convert?url=<listener>` and `POST /convert` with `{url: <listener>}` and `{content: "# x"}` as the test teacher. Assert zero hits, and that each answer has the same status and `Location` as the matching method on a path that never existed (design.md, decision 5)
- [x] 3.2 `test/coverage-map.json`: mention the new assertion in the `deployment-surface.js` entry

## 4. Documentation

- [x] 4.1 `docs-technical-details.md`: remove the `/convert` sections (the asciidoc link, `GET`, both `POST` forms)
- [x] 4.2 `docs-render-pipeline.md`: remove the two `/convert` cases from the diagram and from step 1. Step 8 no longer names an unwrapped caller
- [x] 4.3 `AI/architecture.md`: dependency table (`axios`), feature table (`/convert` API), component map (`http/`), route table (both rows), middleware order, the `resolve-permissions-once` observation's justification, the source documents row for `docs-technical-details.md`, and a new entry under "Security-relevant observations" recording the SSRF and its removal

## 5. Verification

- [x] 5.1 `npm test` green, apart from the known directory-service failures (see `AI/memory/directory-service-credentials-invalid.md`)
- [x] 5.2 `grep -rn "convert" app.js obsidian.js obsidian-page.js index.html` finds no route, handler or link left, only unrelated words such as "converts"
