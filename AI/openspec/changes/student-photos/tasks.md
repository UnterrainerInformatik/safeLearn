## 1. The WebUntis source

- [ ] 1.1 With Gerald logged into WebUntis in a probe browser (like the probe of 2026-11-27, logging patterns only), inspect `classregpage.do` and its requests **for structure only** (element and key names, never values). Find where the student list with WebUntis ids and names comes from, and how the classes a teacher can open are listed. Pick the most stable source and record it in design.md D6 (closes its Open Question). Delete the probe's browser profile afterwards
- [ ] 1.2 `tools/webuntis-photos.js`: the console script of design D6. Pick classes, read students, fetch `image.do` with the session, report per class the number found and without a photo, and download the export of design D5. It sends nothing but to WebUntis. `tools/webuntis-photos.md`: how to run it, what it relies on. Verify "Exporting one class" with Gerald on one of his classes, checking only the counts

## 2. Data and server

- [ ] 2.1 `exam/migrations/025-student-photos.sql`: table `student_photo` (design D1). Verify the migration on a copy of a populated database: existing data unchanged, the backup before it is taken
- [ ] 2.2 `exam/photos.js`: header check (JPEG SOI + SOF dimensions, PNG IHDR), the limits of 256 KB and 600 px, upsert with `imported_at`/`imported_by`, read, count per directory class, list without a person, delete for those without a person / one class / all. Verify "A photo is imported …", "A second import replaces the first", "A file that is not an image is refused"
- [ ] 2.3 `exam/photos.js`: matching against `heldDirectoryPeople()` by username or by normalised class + names, never teachers (design D4). Verify "A clean import", "Two students with the same name", "A student the directory does not know", "A file named after a username", "A teacher in the directory", and NFD/case/order of given names
- [ ] 2.4 `exam/routes-photos.js`: `GET /exam/photos/:username` behind `requireTeacher` with `Cache-Control: private, max-age=31536000, immutable` (design D2); the admin routes `POST /exam/photos/match`, `PUT /exam/photos/:username`, the summary and the deletions behind `actsAsAdmin`. Register them in `exam/index.js`. Verify "A teacher requests a photo", "A student requests a photo", "A teacher in student view …", "A student without a photo", "A teacher who is no admin"
- [ ] 2.5 The field `photo` (version or `null`) per row in the payloads of the gradebook sheet and the student page, the live view (`exam/live.js`) and the correction table (`exam/paper-grades.js`), by `LEFT JOIN` (design D2). Verify that no payload carries image data and that a replaced photo changes the version

## 3. Client

- [ ] 3.1 `exam/client/classes.js`: `personLabel(person)` with photo or initials, the candidate marking kept, and enlargement on hover/focus in CSS (design D3); the styles in the module's stylesheet, hidden in print
- [ ] 3.2 Switch the name cell of the sheet and the student page's heading (`gradebook.js`), the participant rows of online and offline sittings (`live.js`) and the correction table (`tests.js`) to `personLabel`. Verify "The sheet of a class with photos", "Setting group A/B in an offline sitting", "A teacher enlarges a photo", "A photo is replaced"
- [ ] 3.3 `exam/client/photos.js` and the page `/exam/photos`: read the export file or image files, scale in a canvas to ≤ 600 px, send the match, show the three lists with a choice for the ambiguous ones, store the confirmed ones with progress, report the number stored; the summary per class, the list without a person and the three deletions with a confirmation that states the number and the note about the backups (design D4, D7). Reachable from the module's navigation for an admin only
- [ ] 3.4 The new texts in the BabelEdit files of `i18n/` in German and English

## 4. Verification and documentation

- [ ] 4.1 `test/exam-photos.test.js`: the server scenarios of 2.2–2.5 against the module with a test database, including a student and a teacher in student view; add the scenarios to `test/coverage-map.json`
- [ ] 4.2 Browser checks against the demo realm: a teacher sees photos and initials in the sheet, live view and correction table; a student session receives `403` for every photo; the import page with a generated export of the demo accounts (pictures generated, no real people)
- [ ] 4.3 `docs-exam-module.md` (photos, import, who sees them, backups) and `AI/architecture.md` (component map, routes, the observation from 2026-11-27 that the AD carries no photos)
- [ ] 4.4 Run the targeted tests, then the full `npm test` once
