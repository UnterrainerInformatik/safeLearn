# Exam Module
Here you can find how the exam module is switched on, where it keeps its data, how that data is backed up, and how a page places one of its elements.

[Back](README.md) to the main page.

The module is being built in phases (`AI/exam-module-plan.md`). What exists today is its foundation: the switch, the database, backups, the teacher/student gate, the embedding syntax and a module home page at `/exam/`. Tests, the gradebook and the question pool follow.

## The Switch
The module exists only when the instance's environment says `EXAM_MODULE=on`. Any other value, or none, and the instance is exactly the one it was before the module: its code is not loaded, no database file is opened or created, nothing answers under `/exam/`, and no page links to it.

| Deployment | Module |
| --- | --- |
| Production (`deploy/docker-compose.yml`) | Off until a deployment sets it. The compose file passes `EXAM_MODULE` through to the container, and the pipeline fills it from the repository variable `EXAM_MODULE` (Settings → Secrets and variables → Actions → Variables). |
| WYSIWYG container | Always off. Its templates set no `EXAM_MODULE` and mount no data volume, and `test/deployment-config.test.js` keeps it that way. |
| Local `npm start` | Off unless your `.env` says `EXAM_MODULE=on`. |

The start-up log says which it is:

```
Exam module: disabled (EXAM_MODULE is not "on").
Exam module: active, database data/exam.sqlite
Exam module: disabled - the database data/exam.sqlite could not be opened: ...
```

**A module that cannot start never stops the reader.** If the database cannot be opened, the data directory is read-only, a migration fails or the database was written by a newer image, the log says why and the instance runs without the module. A request under `/exam/` that fails is answered with a `500` on its own; every other page and session carries on.

Everything under `/exam/` requires a login, exactly like the content. A teacher in student view is a student to the module as well: teacher pages and teacher-only elements disappear and teacher actions are refused, until the view is switched back.

## The Data
All state lives in one SQLite file, `data/exam.sqlite` relative to the working directory — `/app/data` in the image, the volume `deploy/docker-compose.yml` already mounts from `${DATA_DIR}` for the directory cache. It is opened with `node:sqlite`, which the image's Node 24 ships, so the module adds no dependency.

- **Migrations** are the numbered files in `exam/migrations/`, applied in order at start-up, one transaction each. `PRAGMA user_version` records the last one applied. A migration that fails is rolled back on its own and leaves the database at the last version that applied completely; the module is disabled for that run.
- **A downgrade** — an older image on a newer database — is refused: the module is disabled, the file is left untouched, and the log names both versions.
- **People are recorded by their directory username** (the Keycloak `username`, lowercased), never by the Keycloak user id, which changes when an account is deleted and re-imported.
- **Nothing in the data directory is served over HTTP**, by any path, with or without a session.

`EXAM_DB_PATH` overrides the location. It exists for the verification harness, which gives every run a database of its own; a deployment does not set it.

## Backups
The module writes consistent copies with `VACUUM INTO` into `exam-backups/` beside the database. Each copy opens as a database on its own.

| Copy | When | Kept |
| --- | --- | --- |
| `exam-pre-v<N>-<time>.sqlite` | Before the first pending migration away from version `N` | 90 days |
| `exam-daily-<time>.sqlite` | At start-up if the newest is a day old or missing, then once a day | The newest 14 |

They sit beside the database on purpose: a restore finds them right where it needs them. `VACUUM INTO` only reads the database, so taking a copy cannot damage it.

Getting the copies off the host is the operator's job, with whatever that host already backs up with. **Back up `exam-backups/`, not the live `exam.sqlite`:** a file-level backup can catch the database in the middle of a write, with part of it still in the `exam.sqlite-wal` file beside it, while every copy in `exam-backups/` is complete. A backup of the copies holds grades of minors, so wherever it goes, it has to be a place that may hold them.

**Restoring** means stopping the container, replacing `exam.sqlite` with a copy (and deleting `exam.sqlite-wal` and `exam.sqlite-shm` beside it), and starting again. A copy from an older schema version is migrated forward on start, as any older database is.

**Rolling back** the module itself means unsetting `EXAM_MODULE` and redeploying. The data stays in `exam.sqlite`, untouched, and switching the module back on resumes where it was.

## Placing An Element In A Page
A page places an element with a fenced block whose info string is `safelearn-<kind>`, with the element's parameters as `key: value` lines:

````
```safelearn-test
test: http-caching-1
```
````

The kinds are `test`, `results`, `gradebook` and `live`. Their elements arrive with the phases that build them; until then a placed element says that it is not available on this instance yet.

- **The block goes through the permission filter like any other content.** One inside `@@@ teacher` is gone for a student before it is ever looked at. That is presentation, not protection: every request an element makes is decided by the module on the server again.
- **Teacher-only kinds** (`gradebook`, `live`) render nothing for a session that does not act as a teacher, wherever they sit.
- **With the module off**, a block renders to a short notice for teachers — "only available on an instance with the exam database" — and to nothing for everyone else. The notice carries no data and makes no request. This is what the WYSIWYG container shows.
- **With the module on**, a block renders to a placeholder, and the module's script (`/exam/assets/exam-client.js`, loaded only by pages that carry one) mounts the element into it. The page is server-rendered and revealed as always; the element shows its own loading and error state.
- **The presentation and document views** render every block as they would with the module off.
- **A block of an unknown kind** renders nothing. A block written inside a longer fence — an example of the syntax, like the one above — stays text.

In Obsidian, the blocks show as ordinary code blocks.
