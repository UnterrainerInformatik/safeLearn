## 1. Harness extensions

- [x] 1.1 Add `sharedSession(role)` to `test/harness.js`: a per-role singleton created on first use and released by `shutdown()`. Leave `openSession(role)` untouched — `test/smoke.test.js` must keep getting a fresh, caller-owned session.
- [x] 1.2 Add `roles(session)`: read `GET /userattributes` inside the page and return a normalized `Set` of client roles (`resource_access[<resource>].roles`), LDAP groups (`rolesCalculated`) and the lowercased `name`. Resolve `<resource>` from `keycloak.json` in the working directory, falling back to the token's `azp`. Carry out only the role set — no token leaves the page.
- [x] 1.3 Add `setPreferences(session, values)`: merge over the baseline `{fs:18, t:2, nt:1, s:1.6, dm:0, sl:0, vt:1, va:0, ve:0}`, `POST` the complete block to `/userattributes`, reload, read back, and throw naming key, wanted value and effective value on a mismatch.
- [x] 1.4 Add `render(session, path, {view})`: navigate with `?reveal=true` / `?document=true` as needed, wait for `#markdown-content` or `#revealContent`, fail with path, view and landing URL if the application redirected to the start page instead, and return the page plus its `textContent`.
- [x] 1.5 Add `sameOriginReferences(page)`: collect every same-origin `href`/`src` in the rendered document and request each with the session's cookies, returning status and content type per reference.
- [x] 1.6 Block requests to hosts other than the application and the identity provider on pages opened for content checks, so no check can start depending on an external host by accident.
- [x] 1.7 Verify `npm test` still passes unchanged with only the harness extended.

## 2. Suite wiring

- [x] 2.1 Create `test/checks/` for the by-concern modules and `test/content.test.js` that imports all of them, so `node --test "test/*.test.js"` runs the whole content suite in one process.
- [x] 2.2 Report the elapsed time of a run in its output.
- [x] 2.3 Confirm a full run performs exactly two logins for the content suite, and that `test/smoke.test.js` is unaffected.

## 3. Permissions — `test/checks/permissions.js`

- [x] 3.1 Block-level directives on `md/test-perms.md`, both directions per block: the teacher block, the `5bhif` group block, and the block addressed to the student by name. Derive each expectation from `roles(session)`, never from an assumed class membership.
- [x] 3.2 Whole-file directives: as each role, assert that `md/test-fileperms-teachers.md` and `md/test-fileperms-4bhif-5bhif-2ahif.md` are reachable by direct path exactly when the role set allows, and that a denied request lands on the start page.
- [x] 3.3 The same two files in the navigation tree: present for a permitted session, absent for a denied one.
- [x] 3.4 Time windows on `md/test-md-file.md`: the 2099 blocks are absent for the roles they name, the roles in the same directive that carry no window see it, and the closed 2025 windows are absent.
- [x] 3.5 The teacher→student downgrade: set `vt:0` on the teacher session and assert the teacher-only block and the restricted files disappear from both the page and the tree; set `vt:1` and assert they return.
- [x] 3.6 Cross-check the harness against the application: `teacher` is in the derived role set exactly when the teacher-only block on `md/test-perms.md` is visible.

## 4. Views — `test/checks/views.js`

- [x] 4.1 On `md/test-exam-practice-question.md` as a teacher with `ve:1`: exam variant present, practice variant absent. With `ve:0`: the reverse. Change nothing else between the two reads.
- [x] 4.2 As a student with `ve:1`: the exam variant is still absent and the practice variant is what is shown.
- [x] 4.3 The answer block present with `va:1` and absent with `va:0`, with no other preference touched.

## 5. Rendering — `test/checks/rendering.js`

- [x] 5.1 Callouts on `md/test-md-file.md`: each declared type present as its own element carrying its icon; the collapsible ones closed until opened, then showing their content. Include the long-title and the `-` collapsed forms the corpus demonstrates.
- [x] 5.2 Fenced code blocks render as highlighted markup, and their content survives the link, callout and fragment rewrites unchanged.
- [x] 5.3 Fragments: each marked element carries its index, and the index restarts at the heading boundaries the corpus demonstrates — including the fragments inside blockquote lists.
- [x] 5.4 Side-by-side: the two-column and the three-column demonstrations produce exactly two and exactly three columns, with the surrounding text outside the layout.
- [x] 5.5 Images: absolute URL, Obsidian embed, repository-relative path, and the `|WxH` suffix as element dimensions rather than as part of the description.
- [x] 5.6 PlantUML: decode the emitted `src` and compare it against the source in the corpus file, proving the encoder without contacting the service.
- [x] 5.7 Mermaid: `<pre class="mermaid">` carries the source and the module script importing Mermaid is present; nothing is fetched from a CDN.
- [x] 5.8 Lists: the plain, blockquoted and ordered forms the corpus demonstrates each render as their own list.

## 6. Links and navigation — `test/checks/navigation.js`

- [x] 6.1 The duplicated basename: the wiki-link on `md/test-md-file.md` to `test-presentation` emits the disambiguating path, and following it arrives at `md/presentations/test-presentation.md`.
- [x] 6.2 The name containing spaces resolves and renders, displayed as written.
- [x] 6.3 Each folder under `md/folder-tests/` — spaces, special characters, the very long name — is reachable and its `Untitled.md` renders rather than redirecting to the start page.
- [x] 6.4 The table of contents lists the page's headings and every entry addresses an anchor that exists in the page.
- [x] 6.5 The navigation tree lists the folders and files the session may see.

## 7. Presentation and document — `test/checks/presentation.js`

- [x] 7.1 `md/presentations/test-presentation.md` as a deck: one `#revealContent > section` per `h2` of the source, and each `h3` a nested `section` inside the one it belongs to. Assert on the server-rendered structure so the check does not need jsDelivr.
- [x] 7.2 Fragments in the deck render as `.fragment`.
- [x] 7.3 Same-origin references of the deck resolve and are served as their declared type; references to other hosts are asserted as emitted addresses only.
- [x] 7.4 Implement the known-dangling list: entries carry the reference, the reason and the owning change; a listed entry is reported without failing; an unlisted dangling reference fails; an entry that no longer dangles fails. Seed it with `/obsidian-page.css`, owned by `initial-repairs`.
- [x] 7.5 The document view of a corpus page: content present, navigation tree and top bar absent, content matching the page view for the same session.

## 8. Coverage map and hook

- [x] 8.1 Write `test/coverage-map.json` mapping each check file to the source files and corpus files it guards.
- [x] 8.2 Add `test/coverage.test.js` — no browser, no login — asserting every path in the map exists, every `test/*.test.js` appears in it, and no entry names a file that is gone.
- [x] 8.3 Add a `PostToolUse` hook in `AI/claude/hooks/` that, on `Edit`/`Write` of a guarded path, looks it up in the map and prints the checks covering it. It names them and offers the run as a next step; it never runs `npm test` itself.
- [x] 8.4 Register the hook in `AI/claude/settings.json` and verify it fires on a guarded path and stays silent on an unguarded one.

## 9. Documentation and closing

- [x] 9.1 Extend `docs-testing.md`: the new harness functions, the rule that a check writes every preference it depends on and asserts only what it wrote, what the coverage map is and where it lives, and how the known-dangling list works.
- [x] 9.2 Record in `docs-testing.md` any corpus behavior that turned out not to be assertable without changing the application, naming the file and the behavior.
- [x] 9.3 Update `AI/architecture.md` — the Observations entry stating that verification is login-level only, and the Tooling entry describing the test suite.
- [x] 9.4 Write the memory file recording that the suite exists and when it must run, and link it from `AI/memory/MEMORY.md`.
- [x] 9.5 Run `npm test` twice in a row and confirm both runs are green and report the same result.
