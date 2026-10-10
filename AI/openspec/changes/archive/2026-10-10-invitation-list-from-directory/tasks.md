## 1. Server: e-mail address in the search result

- [x] 1.1 Add `email` to `searchResultEntry` in `middlewares/directory-service.js` (trimmed string, `""` where the directory holds none) and update its doc comment
- [x] 1.2 Update `test/directory-service.test.js`: the exact result field set now includes `email`, a user without an address yields `""`, and no other attribute leaks
- [x] 1.3 Update the live check `test/checks/directory-search.js` (and `test/coverage-map.json` if scenario ids change) to expect `email` among the result fields
- [x] 1.4 Update the response shape in `docs-keycloak.md` / `docs-technical-details.md` and `http/plugin-query-api.http`, including why the address is returned
- [x] 1.5 Run `npm test`, then commit and push safeLearn; merge `public/master` into secureLectures and push

## 2. Plugin: extract the directory picker

- [x] 2.1 Add `email?: string` to `DirectoryEntry`, parse it in `searchDirectory` like the name parts, and widen `ChosenPerson` to carry `email` and `roles`
- [x] 2.2 Move `buildDirectorySearch` with its `chosen` and `fetchWait` state into a `DirectoryPicker` class (container, `chosen`, `onChange`, unreachable/failed callback, `dispose`)
- [x] 2.3 Rebuild `NameListModal` on `DirectoryPicker` without changing its behaviour; split `sortBySurname` out of `orderForWriting`
- [x] 2.4 Build the plugin and run the existing Obsidian picker and surname-order tests; they pass unchanged

## 3. Plugin: formatting

- [x] 3.1 Add `InvitationField`, `InvitationFormat` and the default format; add `invitationFormat` to `SafeLearnPluginData` and `DEFAULT_DATA`
- [x] 3.2 Implement `unescapeFormatText` (`\n`, `\t`, `\\`, single left-to-right pass)
- [x] 3.3 Implement `formatInvitationList` (surname order, dedupe, prefix + fields joined + postfix, entries joined, class via `classLikeValues` sorted and joined by `/`, empty-field counts, whether any address was sent)

## 4. Plugin: the dialog and the command

- [x] 4.1 `InvitationListModal`: heading, picker or the "needs a directory login" note, the four field rows with checkbox and up/down buttons
- [x] 4.2 The texts: field separator, prefix, postfix, and the entry separator as a Line break / Comma / Custom dropdown with a revealed free-text input
- [x] 4.3 Preview of the first five entries (placeholder person when nobody is chosen), refreshed on every format change and on the picker's `onChange`
- [x] 4.4 Insert and Copy confirmations in the button container; Ctrl/Cmd+Enter inserts; not confirmable with no field or without a login; nothing happens with nobody chosen
- [x] 4.5 Insert at the cursor replacing a selection, cursor after the list; Copy via `navigator.clipboard.writeText` with a count notice, failure keeps the dialog open
- [x] 4.6 Missing-field notice (count per field, or "the instance does not send e-mail addresses")
- [x] 4.7 Persist the format on either confirmation and pre-fill it on open
- [x] 4.8 Register "Invitation list…" in `AUTHORING_COMMANDS` with an icon confirmed against `getIconIds()` (e.g. `mail`)

## 5. Verification and release

- [x] 5.1 Obsidian tests in `test/obsidian/plugin.test.js`: the author's example format (`,,,` / `,` / `,,\n`), addresses one per line and comma-joined, `\t` separator, field reordering, empty address written and reported, format remembered across reopening, copy leaves the document unchanged
- [x] 5.2 Document the command in the plugin `README.md`
- [x] 5.3 Update `AI/architecture.md` (feature table and component map)
- [x] 5.4 Plugin release (version in the three usual places, tag, GitHub release with `main.js`, `manifest.json`, `styles.css`)
