## Context

See proposal.md, "Why". What shapes the removal:

- The catch-all `app.use((_, res) => res.redirect(getStartPage()))` at the end of `app.js` answers every method, so once the two `/convert` handlers are gone, `GET` and `POST /convert` reach it like any unserved path. No new code is needed for the "answered as unserved" requirement.
- `resolveFileVisibility` (`obsidian.js`) takes a parsed directive, and two justifications for that exist side by side: `/convert` rendering bodies without a file, and the page handler re-parsing the first line of the file it has just read, because the index is a scan-time snapshot (`corpus-index`, settled by `resolve-permissions-once`). The second remains, so the signature stays.
- The harness uses `POST /convert` with `{content}` as a probe in `test/checks/permissions.js` (section 3.5a), because it can post any directive without a corpus file. Its comment says that no corpus file carries a whole-file directive with a closed window, so `/convert` is the only way to reach that message. That is stale: `md/test-fileperms-window-closed.md` exists and is already in `restrictedFiles`, which checks both refusal causes and the tree/page agreement for every listed file.

## Goals / Non-Goals

**Goals:**
- No outbound fetch on behalf of a request, anywhere in the application.
- The permission coverage the probe gave survives, through corpus fixtures.

**Non-Goals:**
- A replacement "render any Markdown" endpoint. If one is ever wanted, it is a new change with its own threat model.
- Changing `resolveFileVisibility`'s signature or the page's re-parsing of the directive.

## Decisions

### 1. Delete, do not harden

An allowlist of hosts, dropping the cookie forwarding, or a teacher-only gate would each keep a server-side fetcher alive for a route nobody uses. Deleting removes the class of bug. *Alternative:* keep `POST {content}` only, since it fetches nothing. Rejected: it is unused too, and it is the one path by which Markdown that is not a corpus file reaches the renderer. That path forces `attachment-access-control` to carve out a no-grant rule, and keeps "Content with no index entry" alive in `corpus-index`.

### 2. No special answer for the old path

`/convert` falls through to the catch-all like a path that never existed. No `410 Gone`, no explanatory body. A distinct answer would be a route of its own, which is exactly what is being removed, and the start-page redirect is what a stale bookmark gets everywhere else.

### 3. Replace the probe with fixtures, per direction

What the `convert` test covered, and where it goes:

| Direction the probe covered | Covered after the change by |
| --- | --- |
| A directive naming a role nobody holds refuses student and teacher | New fixture `md/test-fileperms-nobody.md` (`@@@ nobody-holds-this-role`), added to `restrictedFiles`. `maySeeFile` already derives the expectation, so `admin` stays able to see it |
| A closed window refuses with its own message, whatever the roles | `md/test-fileperms-window-closed.md`, already in `restrictedFiles`, and `refusalFor` already asserts the message per cause |
| A met directive lets the body through | Every `restrictedFiles` entry a session may see. The check already asserts `content` is present |
| A met directive's first line is stripped from the body | **New assertion** in the existing `restrictedFiles` loop: a visible file's rendered body does not contain its `@@@` line |

Directive grammar on posted bodies (a body with no file) has no counterpart left to test, which is the point. The `coverage-map.json` entry for `permissions.js` drops "That the same rule reaches Markdown posted to /convert" and lists the new fixture under `corpus`. `test/coverage.test.js` then holds the map and the corpus together.

### 4. `axios` goes if it is unused

`app.js` is its only importer today. The task re-checks with a search at apply time, and removes the dependency from `package.json` and `package-lock.json` only if nothing else imports it.

### 5. Outbound-fetch check in the harness

A deployment-surface check requests `GET /convert?url=<harness URL>` and `POST /convert` with `{url: <harness URL>}`, where the harness URL is a local listener that records hits. It asserts zero hits, and that both answers match the answer for a never-existing path (status and `Location`). This guards against the route coming back by a merge from downstream.

## Risks / Trade-offs

- [Someone outside the codebase uses `/convert`, e.g. an old link in a course page elsewhere] → They land on the start page. The route was documented in `docs-technical-details.md` only, and the corpus does not link it. The sync note to secureLectures says so.
- [The new fixture shows up in the production navigation tree] → It carries a whole-file directive nobody holds, so it is listed for `admin` only, like the existing `test-fileperms-*` fixtures. secureLectures removes test fixtures downstream anyway (`AI/memory/securelectures-downstream-role.md`).
- [Removing `axios` breaks a transitive user] → Decision 4 checks before removing. `npm test` runs afterwards.

## Migration Plan

1. Land in safeLearn with `npm test` green, then sync to secureLectures in the usual order.
2. Rollback is reverting the commit. No state is involved.
