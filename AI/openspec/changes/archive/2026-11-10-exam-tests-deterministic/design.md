## Context

`test/exam.test.js:4275` and `test/exam-offline.test.js:333` / `:427` fail on every fresh checkout and on HEAD. Both causes were traced during `hot-reload-without-paths`:

- `.gitignore` line 44 excludes `*.zip`. `md/test-exam-handout.md` embeds `[[test-handout-starter.zip]]` and the check requests `/md/assets/handout/test-handout-starter.zip`. Commit `7665445` added only the two PNGs in `md/assets/handout/`; the archive existed only in the working tree it was written in.
- `startSitting(db, id, at = now())` writes `opens_at = at`; `endSitting(db, id, at = now())` writes `closes_at = at`. Migration `006-online-tests.sql` holds `CHECK (opens_at < closes_at)`. `now()` is `new Date().toISOString()`, millisecond resolution. Two calls within one millisecond make the update raise `ERR_SQLITE_ERROR` from inside the transaction.

`requireOpen` already guards `endSitting` and `extendSitting` by state; at `at === opens_at` the state is "open", so the guard lets the end through.

## Goals / Non-Goals

**Goals:**
- The three checks pass on a fresh checkout, deterministically.
- An end that would not leave a window of positive length is refused as a conflict, before any write.
- An ignored file under `md/` cannot happen silently again.

**Non-Goals:**
- Touching the browser-timing failures listed in `AI/memory/flaky-content-checks.md` (and `exam.test.js:6699`, seen once).
- Changing the schema constraint. It stays as the last line of defence.

## Decisions

**Refuse, don't clamp.** Moving `closes_at` to `opens_at + 1 ms` would pass the constraint, but at the moment of the call the sitting would still be "open", so `endSitting` would return a sitting that has not ended. A refusal with `ConflictError("exam.errors.tests.sittingEndBeforeOpen")` is honest and matches how `extendSitting`/`endSitting` already refuse a sitting that is not open. The check is `at <= row.opens_at` (ISO strings compare correctly), placed after `requireOpen`. Online sittings get the same guard through the same function; for them `opens_at` is planned and an end at that instant is equally meaningless.

**Tests pass an explicit start.** `startSitting(db, sitting.id, inSeconds(-5))` or an equivalent ISO string a few seconds back. The duration and the extension assertions are relative to the returned `closesAt`, so they hold unchanged. A third test calls `endSitting(db, id, started.opensAt)` and asserts the new key, and that `getSitting` still reports "open" with the same `closesAt`.

**A negated ignore rule for exactly this file.** `!md/assets/handout/test-handout-starter.zip` after `*.zip`, not `!md/**/*.zip`: a real course archive in a downstream `md/` (secureLectures) should stay ignored by default. The archive is a minimal valid ZIP holding one small text file, so it is served as a binary and stays a few hundred bytes.

**A check that no `md/` file is ignored.** In `test/coverage.test.js`, which runs without browser or login: `git ls-files --others --ignored --exclude-standard -- md/` must print nothing. It fires in the working tree of the author who has the file and forgot it is ignored, which is the only place the mistake can be seen. Skipped with a note when `git` is not available or the tree is not a repository (e.g. an exported tarball).

## Risks / Trade-offs

- [A downstream instance with its own ignored files under `md/` would fail the new check] → secureLectures drops tests on merge (`securelectures-downstream-role`), so the check does not run there.
- [The new i18n key has to exist in both files] → Added to `i18n/de.json` and `i18n/en.json` under the same path as `sittingNotOpen`, in BabelEdit's format.
