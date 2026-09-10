## Why

A teacher or admin who wants an overview of the school directory today has to run the "List classes" command and separately search by name in the directory picker - there is no single place to see who the teachers are, what classes exist, and what a specific person is allowed to see. Gerald asked for exactly that: one read-only page, shown only to a held teacher/admin connection, that answers "who's a teacher", "what classes exist", and "what does this one person hold" without leaving the plugin or touching Keycloak.

## What Changes

- Add a new, read-only "Directory info" view to the plugin, opened via a command/ribbon action, visible only while `hasDirectoryRole()` holds.
- The view has three sections, all backed by the existing `searchDirectory()` / `DirectoryEntry` infrastructure already used by the directory picker and "List classes":
  - A list of every teacher the directory reports (role `teacher`/`teachers`/`admin`).
  - A list of every class/group the directory reports (the same class-like values `classLikeValues()` already derives).
  - A searchable list of every user in the directory; selecting one shows that person's full role/group set (their raw `DirectoryEntry.roles`), formatted the same way entries are already rendered elsewhere in the plugin.
- Nothing in this view writes anything - not to the vault, not to Keycloak, not to the safeLearn server. It only issues the same read-only `searchDirectory()` calls the picker already makes. No new server endpoint, no new permission gate beyond the existing `hasDirectoryRole()`/`GET /api/admin/directory/search` teacher-or-admin check.
- Not in scope: editing roles, classes, or any Keycloak state from the plugin - that stays a manual Keycloak-admin task "bis auf Weiteres", per Gerald.

## Capabilities

### New Capabilities
- `plugin-directory-info-view`: a read-only overview page - all teachers, all classes, and a searchable per-user role lookup - shown to a held teacher/admin connection.

### Modified Capabilities
(none - this consumes the existing `plugin-directory-search` capability's `searchDirectory()`/`classLikeValues()` without changing its behavior)

## Impact

- Affected code: `main.ts` in `safeLearn-Obsidian-plugin` (new view/modal class, a new command and/or ribbon icon, reuse of `searchDirectory()`, `classLikeValues()`, `DirectoryEntry`, `hasDirectoryRole()`).
- No server-side (`safeLearn` repo) changes - the existing `GET /api/admin/directory/search` endpoint and its teacher-or-admin gate are reused as-is.
- No new dependencies, no new settings.
