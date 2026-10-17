## Context

See `proposal.md` for the motivation and `AI/exam-module-plan.md` for the decisions behind the domain (sections 2, 5–7). Those decisions are not repeated here. This document covers how the module fits into a codebase that so far has no database, no client-side framework and no build step.

The constraints that shape the approach:

- **One image, three tiers.** The image that secureLectures runs is the same one the WYSIWYG container runs, where nothing but `md/` and `keycloak.json` is mounted. The module therefore has to be inert by default, and its absence must be the instance as it is today, byte for byte. Tier 1 (`AUTH=none`) and the rule that `EXAM_MODULE=on` refuses to start without Keycloak belong to the change `publishing-without-keycloak`. This change assumes a Keycloak session.
- **Routing order in `app.js`.** Everything is registered inside `initKeycloak(app).then(...)`. The bearer-token directory routes come first, then `app.use(checkAuthenticated)`, the `/` redirect, the `.md` handler, the static allowlist, `/search`, `/convert`, `/userattributes`, and finally the catch-all redirect and the error handler. Module routes have to sit after `checkAuthenticated` and before the catch-all.
- **Render pipeline.** `sanitizeAndParseMarkdown` (in `app.js`) → `preParse` (in `obsidian.js`): `removeForbiddenContent`, PlantUML, Mermaid, `preMarkCode`, and so on, then `marked`, `manipulateHtml` and `DOMPurify.sanitize`. Fenced blocks are recognised by info string, as Mermaid and PlantUML already are.
- **Sessions live in memory** (`deployment-surface`: "Sessions are held in memory, deliberately"). A restart logs everyone out.
- **Data directory.** `data/` relative to the working directory (`/app/data` in the image), mounted from `${DATA_DIR}` in `deploy/docker-compose.yml`. The directory cache already lives there.
- **Directory data.** `heldDirectoryUsers()` in `middlewares/directory-service.js` holds the realm's users in process, with `username`, names and the merged role/group set (`directoryUserRoles`: LDAP `OU=` parts plus `safeLearn` client roles). On the shared demo realm, classes exist only as client roles, and the merge covers both.
- **Node 24** in the image: `node:sqlite` (`DatabaseSync`) is available without a flag.

## Goals / Non-Goals

**Goals:**

- Ship each phase to production while the switch is still off, and switch it on when the gradebook (P4) is ready, before 05.02.2027.
- Keep the module removable: one directory, one `import()`, one hook registration and one compose variable.
- Introduce no build step and no client framework.

**Non-Goals:**

- Operating tier 1 and the `AUTH=none` cross-check (`publishing-without-keycloak`).
- Access control for attachments under `/md` (`attachment-access-control`). The module's own images never go through `/md`.
- Moving preferences or `lastVisitedUrl` out of Keycloak into the database, and learning-route progress. Both are possible follow-ups once the database exists.
- Restricting a sitting to the school network by client IP. That needs a spike first (see Open Questions).
- Obsidian plugin support for the new blocks (decorations, commands). They render in Obsidian as ordinary code blocks, which is readable.

## Decisions

### D1 — In-process module behind a dynamic import, not a separate service

`app.js` checks `process.env.EXAM_MODULE === "on"` and only then calls `await import("./exam/index.js")`. That call returns either a router plus its embed handlers, or `null` with a logged reason (database not openable, migration failed, newer schema). The router is mounted at `/exam` after `checkAuthenticated`. The whole call is wrapped in `try/catch`, so a failing import is logged as "module disabled", the rest of the server starts, and requests under `/exam/` fall through to the catch-all.

*Alternative:* a sidecar container with its own process. It would isolate the module better, but it needs either a second OIDC client or session sharing across processes, plus a second deployment unit. The dynamic import already gives the property that matters: the code is not loaded when the switch is off.

### D2 — `node:sqlite`, one file, `PRAGMA user_version` migrations, `VACUUM INTO` backups

- The database is `data/exam.sqlite`. Its path can be overridden with `EXAM_DB_PATH` so the harness can point at a temporary directory. The variable is deliberately absent from the compose file and has to be declared to `test/deployment-config.test.js` as a test-only variable.
- The database runs in WAL mode with `foreign_keys=ON`.
- Migrations are numbered SQL files under `exam/migrations/`, applied in order inside one transaction each, and `user_version` records the last one applied. A database newer than the code → the module is disabled (spec `exam-foundation`).
- Before the first pending migration, and once a day while running (a timer), the module writes `VACUUM INTO data/exam-backups/exam-<timestamp>.sqlite`. It keeps 14 daily copies and every pre-migration copy for 90 days.
- Plain SQL with no ORM, so a later move to Postgres means changing the dialect rather than rewriting the module.
- `DatabaseSync` is synchronous. At this scale (one school, ~30 concurrent writers during a sitting, single-row writes) a query takes microseconds and does not block the event loop noticeably. *Alternative:* `better-sqlite3`. It is synchronous as well and needs a native build on Alpine. Rejected.

### D3 — Embedding as fenced blocks `safelearn-<kind>`, resolved in `preParse`

- **Syntax.** A fenced block with the info string `safelearn-<kind>` and `key: value` lines as its body:

  ````
  ```safelearn-test
  test: http-caching-1
  ```
  ````

  *Alternative:* a `@@@`-style directive or a custom inline tag. A fenced block was chosen because the Obsidian plugin's directive grammar and decorations (`plugin-editor-decorations`, `test/directive-grammar.test.js`) cover `@@@` only and would need a mirror change. Obsidian renders an unknown fenced block as a readable code block. And the pattern already exists for `mermaid`/`plantuml`.
- **Where it runs.** A new step `preReplaceEmbeds(md, req)` runs in `preParse` directly after `removeForbiddenContent` and before `preMarkCode`. Because it runs after the permission filter, a block inside a hidden section is already gone. Because it runs before `preMarkCode`, the block is not protected as code.
- **Hook registry.** `obsidian.js` exports `registerEmbedHandler(kind, handler)`. When no handler is registered for a kind that is known but switched off (`test`, `results`, `gradebook`, `live`, …), the default renders a teacher notice or nothing. For an unknown kind it renders nothing. The module registers its handlers at start-up. A handler returns an HTML placeholder: `<div class="sl-embed" data-sl-embed="<kind>" data-sl-<key>="…">` with a loading text. `data-*` attributes survive `DOMPurify.sanitize`, and this is verified by a check. Handlers render no data on the server, so the page stays cacheable by permission alone and the server-side render cost does not grow.
- **Teacher check for the notice.** The teacher check for the notice uses `hasSomeRoles(req, ["teacher"], true)`, the same rule as `@@@ teacher`. A teacher in student view therefore sees what a student sees.
- **Views.** The presentation and document views call the pipeline with a flag that makes `preReplaceEmbeds` use the default handlers (spec `exam-embedding`).

### D4 — Client: vanilla ES modules and custom elements, no build

- `wrapInPage` adds `<script type="module" src="/exam/assets/exam-client.js">` only when the module is active **and** the page contains at least one placeholder.
- The script defines custom elements per kind, finds the `.sl-embed` placeholders, mounts into them and fetches `/exam/api/*` with the session cookie.
- It does not take part in the page bootstrap's reveal (`page-bootstrap`: one script reveals a page). Each element shows its own loading and error state.
- The module's own pages (course overview, roster editor, question browser, editor, live view) are server-rendered shells with the same top bar (`getTopBar`) plus the same client script.
- `/exam/assets/` is a new mount in the static allowlist that serves only the module's client directory.

*Alternative:* Preact/Lit via an import map. That would be the first third-party client framework, and it would need a vendored copy, because `presentation-view` forbids contacting other hosts. Not worth it for forms, tables and one timer.

### D5 — Identity and roles

- **Identity.** The identity key is `req.user.accessTokenDecoded.preferred_username` (the Keycloak `username`, which is the LDAP `sAMAccountName` for federated accounts), lowercased.
- **Names.** Display names come from the directory cache when it holds them, otherwise from the token. For the 118 teachers without names, the username is used.
- **Teacher gate.** The gate is `hasSomeRoles(req, ["teacher"], true)`, **with** `allowOverride`, the same rule as `@@@ teacher`. A teacher in student view (`vt == 0`) is downgraded for the module as for the content: the module's teacher pages and every teacher-only embedded element disappear, and the teacher API refuses the session. Switching the view back restores everything, since the role set is rebuilt per request. The downgrade is presentation of the permission model, not a separate protection: the API still decides on the server, and a downgraded session gets exactly a student's API rights.
- **Student-only actions.** Writing a test is allowed only to someone who is on the course's roster, and the roster is the authorization, not the class role. A teacher is never on a roster, so a downgraded teacher gets a student's rights but still cannot write a test.

### D6 — Roster from the directory cache, by class value

- The checklist for a class lists every directory user whose merged role set contains the class name (lowercased, e.g. `5ahif`). This is the same membership the directory search uses, so it works on LDAP and on client-role realms alike.
- If the directory service is not configured or not yet warm, the roster editor says so, and the teacher can still add students by username.
- Rosters store a snapshot of username and names. A nightly or on-demand refresh updates names only, never membership.

### D7 — Grades derived on read, overrides stored

- Entries and attempt fractions are stored. Category fractions and proposals are **computed on read**, which is trivially cheap for ≤ 35 students × a few dozen entries. A stored proposal could go stale against new weights or a new scale. Overrides and comments are stored per student × course × semester.
- **Semester assignment.** An entry belongs to the semester its date falls in. The WS proposal uses WS entries. The SS proposal is the year grade and uses all entries of the school year. This is the Austrian rule that the year grade covers the whole school year. (Assumption, stated in spec `gradebook`. Teachers can always override.)
- Fractions are stored as `REAL`. Thresholds are compared with `>=` on the percentage, after rounding the fraction to 4 decimal places, so that 0.75 computed as 0.7499999 is not demoted.

### D8 — Attempts: server deadline, lazy plus swept finalization, device cookie

- **Starting.** On first open, the server inserts the attempt with `startedAt` and `deadline = min(startedAt + duration, window.to)`, generates the per-attempt permutation of questions and answers, and generates a random 128-bit token per answer. The mapping stays on the server.
- **Saving.** Each answer change is a `PUT` that the server accepts only while `now < deadline` and `submittedAt` is null.
- **Finalization.** An attempt past its deadline is finalized (graded and written to the gradebook) on the next request that touches it, and by a sweep every 30 s. No client involvement is needed.
- **Device binding.** At start, the server sets an `httpOnly`, `SameSite=Strict` cookie `sl-attempt-<id>` with a random secret, and stores a hash of the secret on the attempt. A request without the matching cookie is refused and logged as a refused device. The binding is to the cookie, not to the express session id, because sessions die on restart (spec `online-test`: a restart must not lock a student out). The teacher's "release" clears the hash, and the next browser to open the attempt binds anew.
- **Focus log.** The page sends `visibilitychange`/`blur`/`focus` events as small `POST`s, and if needed `navigator.sendBeacon` on `pagehide`. The server aggregates the count and the duration away per attempt.

### D9 — Live view by SSE on its own authenticated stream

- **Stream.** The live view opens `GET /exam/api/sittings/:id/events` (`text/event-stream`). The route sits behind `checkAuthenticated` and the teacher gate (D5) like every module route. It sends one full snapshot on connect and then an event per change: attempt started, answer saved (remaining time only, never answers), submitted, focus loss, refused device, release. A heartbeat comment every 25 s keeps proxies from closing an idle stream.
- **Who opens it.** Only the live view, both as `safelearn-live` embed and as module page. No other module page holds a stream.
- **Not over `/hot-reload`.** That channel is registered ahead of `checkAuthenticated` and carries no identity. Exam data never travels over it, and it is not extended.
- **Re-check per event.** The role set is rebuilt per request, but a stream is one request. So before each event the server re-checks the session (still authenticated, still teacher after the student-view downgrade). If it fails, the server sends a final `refused` event and closes the stream.
- **Source of events.** The module's write paths (start, save, submit, focus, refusal, release, the 30 s sweep) notify an in-process emitter keyed by sitting. That needs no database polling and no extra process.
- **Reuse.** The hot-reload code in `app.js` (headers, client map, cleanup on `close`) is inline today. Its stream setup is extracted into a small helper that both use, without changing hot-reload's behavior.
- **Fallback.** If the stream drops, `EventSource` reconnects by itself, and the reconnect gets a fresh snapshot. If it fails three times in a row, the client switches to polling `GET /exam/api/sittings/:id/live` every 5 s and retries the stream every minute. The snapshot endpoint exists anyway for the initial load and for the fallback.

*Alternative:* polling every 2 s. It is simpler and needs no connection, but it is less immediate, and SSE is already the transport the app uses for live updates.

*Risk:* browsers allow six HTTP/1.1 connections per host. Every content page already holds one `/hot-reload` stream, so a teacher with many tabs plus a live view could run out of connections, and requests would then queue. Mitigation: only the live view opens a second stream, the fallback above covers a refused stream, and over HTTP/2 the limit does not apply (task 5.10a checks whether the proxy in front of babylon5 serves HTTP/2).

### D10 — One-time import as a tool script using jsdom's XML parser

- `tools/import-moodle-pool.mjs` takes the two XML paths and the database path. It parses with `new JSDOM(xml, { contentType: "text/xml" })`, because `jsdom` is already a dependency, so the import adds none.
- It pairs the two files by position and verifies type, answer count and correct pattern, refusing all on any mismatch (spec `question-pool`). It sanitizes with the same `DOMPurify` instance and moves base64 `@@PLUGINFILE@@` images into an `image` table (BLOB).
- It runs once, by hand, in the container on babylon5 (`docker exec`), after the module is switched on there.
- Images are stored in the database rather than as files, so the one-file backup covers them.

### D11 — Board solution through the existing Reveal path

The module builds the slide HTML server-side (one `<section>` per question in the course language, correct answers marked, the share correct from submitted attempts) and passes it through `wrapInReveal`, so the deck inherits `presentation-view`'s guarantees (pinned Reveal version, no foreign hosts).

### D12 — Rollout is controlled by content, not by a second switch

Switching the module on in production exposes nothing to students by itself. Students reach the module only through embed blocks a teacher places, and through tests a teacher schedules. A "teachers first" phase therefore needs no extra flag. The plan's dark launch is the period during which `EXAM_MODULE` stays unset in secureLectures' compose file.

## Risks / Trade-offs

- [The database holds grades of minors on one host] → Daily `VACUUM INTO` copies on the same volume do not survive a lost disk. Getting them off the host is the operator's responsibility, not the application's: the copies stay beside the database so a restore finds them there, and the operator backs up `exam-backups/` (never the live file) with the host's own backup. safeLearn is the open-source staging instance and keeps nothing worth backing up; secureLectures' data directory is covered by babylon5's backup (settled with Gerald on 2026-10-17). Only aggregates are ever logged ([[pii-handling-real-data]]).
- [Synchronous SQLite in the request path] → Writes are single-row and indexed. A sitting of 30 students autosaving is well under 100 writes per second. Measured as part of P3's harness checks with a simulated class.
- [An embed block's placeholder is stripped by `DOMPurify`] → A rendering check asserts that the placeholder and its `data-*` attributes survive. The kind and parameters are escaped before they are placed in attributes.
- [`EXAM_DB_PATH` trips `test/deployment-config.test.js`] → Declared there as a variable that deliberately does not reach a deployed instance.
- [A teacher switches to student view mid-sitting and loses the live view] → Intended (D5). The live view's stream ends with the refusal, and the page says that the student view is active and how to switch back. The sitting itself runs on the server and is unaffected.
- [A clock change or a server restart during a sitting] → Deadlines are absolute timestamps in the database, and the sweep restarts with the process. The device cookie survives the restart.
- [The question pool wears out over the years, because everyone gets the same questions and the solution is shown on the board] → The usage history is shown in the browser (spec `question-pool`), and the editor grows the pool. Swapping questions per make-up is still open.
- [One very large change] → The tasks are grouped by phase. Each phase ends deployable with the switch off and its checks green. The change is archived only when all phases are done, so the backlog entry stays until then. Archiving after P4 and opening a follow-up for the rest remains possible if the scope has to be cut.

## Migration Plan

1. Each phase is merged to safeLearn and synced to secureLectures with `EXAM_MODULE` unset. Production behaves exactly as before, and the harness proves it (spec `browser-verification`).
2. Once P0 + P1 + P4 are done (target: end of November / mid-December 2026), set `EXAM_MODULE=on` in secureLectures' `deploy/docker-compose.yml` and `deploy/.env`, and redeploy. Teachers create the school year, rosters and courses, and start entering results.
3. After P2, run the one-time import on babylon5 (D10) and check the report (94 questions, 22 categories, 9 essays dropped).
4. After P3, run a pilot sitting with one class before the first graded test.
5. **Rollback.** Unset `EXAM_MODULE` and redeploy. All data stays in `exam.sqlite` untouched, and switching it back on resumes. A schema rollback goes from the pre-migration copy.

## Open Questions

- **Retention (P5).** How long the grades, attempts and focus logs of a student who has left are kept, and what the year change deletes versus archives. Spec `school-year-change` requires a retention period and a confirmation step. Its value is a setting decided before P5.
- **School-network restriction.** Whether safeLearn on babylon5 sees the real client IP (a reverse proxy setting `X-Forwarded-For`, given that `trust proxy` is set). That needs a spike. If it works, a sitting gets an optional "school network only" flag, which is off for make-ups at home. This would be an additive requirement on `online-test`.
- **Make-up sittings swapping questions.** Whether a make-up may replace individual questions to counter pool wear. If yes, that is a per-sitting question override on top of the test's snapshot, and grades stay per attempt.
- **Deleting used questions (P7).** Spec `question-editor` settles this as "retire, never delete" so the usage history keeps its target. Still open: who may retire a question (any teacher, or only the one who created it or last edited it), and whether a retired question can be revived.
- **Follow-ups the database enables, outside this change.** Learning-route progress per student, and moving preferences and `lastVisitedUrl` out of Keycloak user attributes.
