---
name: securelectures-exam-db-restore
description: "Where the secureLectures exam DB and its copies live on babylon5, and how to undo a single mistaken edit without a full restore"
metadata:
  node_type: memory
  type: reference
  originSessionId: c209da04-a12a-4b6e-8008-3432bfb60c6c
  modified: 2026-11-24T08:50:11.268Z
---

"Sicherungs-repo" can mean two things: `guFalcon/secureLectures-save` holds only the `md/` corpus (12 h cron, see [[securelectures-content-nextcloud]]); exam-module data (tests, sittings, grades) lives in `/app/data/secure-lectures/exam.sqlite` on babylon5, with daily and pre-migration copies in `exam-backups/` beside it. Since 2026-11-24 also `exam-host-*.sqlite` every 8 h (newest 9 kept) by `~/scripts/secure-lectures/backup-exam-db.sh` (cron `/etc/cron.d/secure-lectures-exam-db`); Gerald wants these **local only**, never in a git repo — urbackup (covers `/app/data`) handles anything older.

The host has no `sqlite3`; run a small `node:sqlite` script inside the `secureLectures` container (`docker cp` + `docker exec … node`), opening copies `readOnly`.

**How to apply:** for one mistaken edit (2026-11-24: a sitting's planned time of another teacher's 4AHIF test), compare the affected rows between live DB and the newest copy, then UPDATE only those rows with a guard on the current wrong values — never replace the whole file, that discards everyone else's work since the copy. Keep output to test/sitting rows and aggregates ([[pii-handling-real-data]]).
