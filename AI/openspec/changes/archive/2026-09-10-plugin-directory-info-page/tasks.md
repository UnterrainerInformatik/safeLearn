## 1. Entry point and gating

- [x] 1.1 Add a "Show directory info" command, registered the same way "List classes" is (`main.ts:605`-ish), enabled/visible only while `hasDirectoryRole()` holds
- [x] 1.2 Reuse the existing login-state explanation text (`main.ts:482`-`488`) for the case the command is invoked without a qualifying role, extending it to mention the new view alongside the picker and "List classes" rather than inventing a fourth message

## 2. Directory fetch and derived data

- [x] 2.1 On open, issue one `searchDirectory("")` call and hold the resulting `DirectoryEntry[]` for the lifetime of the modal
- [x] 2.2 Derive the teacher list: entries whose `roles` include `teacher`, `teachers`, or `admin`
- [x] 2.3 Derive the class list via the existing `classLikeValues(entries)`, unchanged
- [x] 2.4 Handle a non-`ok` outcome (`unreachable`, `failed`, `refused`) from the single fetch by showing the existing status-line wording (`main.ts:3096`-`3106`'s `setStatus` pattern) instead of any section's list

## 3. Modal and sections

- [x] 3.1 Add a new `Modal` subclass (alongside `ColumnCountModal`/`NameListModal`) that opens with the fetched-and-derived data
- [x] 3.2 Render the "Teachers" section as a plain list of names
- [x] 3.3 Render the "Classes" section as a plain list of values
- [x] 3.4 Render the "Users" section: a text input that filters the held `entries` by name client-side as it is typed, results as plain clickable `<div>`s (never `<button>`, matching `NameListModal`'s convention so the generic test-harness button/input lookups stay unambiguous)
- [x] 3.5 On selecting a user from the results, show that entry's full role/group set using the existing `"${name} — ${roles.join(", ")}"` rendering convention
- [x] 3.6 Confirm no control anywhere in the modal writes to the vault, the safeLearn server, or Keycloak - the modal only reads via `searchDirectory`

## 4. Manual verification

- [ ] 4.1 In the plugin's dev vault, log in as a teacher/admin account and open the new command: confirm all three sections populate from one directory fetch
- [ ] 4.2 Confirm the command/view is unavailable (or shows the shared explanation) when logged out and when logged in without a qualifying role
- [ ] 4.3 Confirm selecting a user shows their roles, and that clearing/retyping the search updates the results without a page reload
- [ ] 4.4 Confirm the active editor's document is unchanged after opening, searching, and selecting inside the view
