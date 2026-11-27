Source: none. The request came up in a conversation with Gerald on 2026-11-27. Decided then: the official photos are the ones in WebUntis. The on-prem AD carries none (0 of 2,261 accounts, verified against `objectGUID`). Microsoft 365 photos are changed by the students themselves and do not qualify. The school has cleared copying the photos into safeLearn for teachers. A seating plan is a later change, parked in `AI/open-proposals.md`.

## Why

A teacher who has trouble with names sees only names in the module: in the gradebook sheet, in the live view of a running test, and in a sitting's list where attendance and group A/B are set. A face beside each name is what lets a teacher connect the two. WebUntis already holds an official photo of every student. safeLearn has no photos at all.

## What Changes

- **A photo per student, stored in the exam module's database**, keyed by directory username like everything else the module records. A person without a photo shows their initials in the same place.
- **An import page for an admin.** It takes either the export file of the WebUntis tool below or a set of image files. It matches each photo to a directory person by class and name, or directly by a file named after the username. It shows what matched, what is ambiguous and what matched nobody before anything is stored, and lets the admin settle an ambiguous match by picking the person. A new import replaces a person's earlier photo. The page also shows how many photos are held, lists photos whose person is no longer in the directory, and deletes them, per class or all at once.
- **A tool that exports the photos from WebUntis**, run by a teacher in their own logged-in WebUntis tab. It reads the class register's student list and the photos it shows (`image.do`, 134 × 200 px, JPEG, a few KB each) for the classes the teacher picks, and writes one export file of names, classes and images. It runs outside safeLearn and needs no WebUntis credentials of safeLearn's own.
- **The photo appears beside the name** in the gradebook sheet, in the student page's heading, in the live view of online and offline sittings (which includes setting attendance and group A/B), and in the correction table of a test on paper. Hovering or focusing a photo shows it at its full size.
- **Only a session acting as a teacher receives photos.** A student never does, and neither does a teacher in student view. A photo is served only through a route behind that check, never as a static file.

## Capabilities

### New Capabilities
- `student-photos`: storing a photo per student, the import and its matching, removing photos, serving them only to teachers, the WebUntis export tool, and showing the photo beside the name in the module's lists.

### Modified Capabilities
None. The lists keep their behaviour. They gain a photo beside the name, which `student-photos` specifies for every place it appears.

## Impact

- `exam/migrations/025-student-photos.sql`: a new table `student_photo`.
- `exam/photos.js` (new): storing, matching, listing and removing photos. `exam/routes-photos.js` (new): the photo route, the import and the admin page's data.
- `exam/client/classes.js`: a shared person element (photo or initials, then the name) used where `displayPerson`/`personName` render a row's name today. `exam/client/gradebook.js`, `exam/client/live.js` and `exam/client/tests.js` switch to it. `exam/client/photos.js` (new): the import page.
- The payloads of the sheet, the live view and the correction table carry a photo version per row, so the browser asks only for photos that exist and caches them until they change.
- `tools/webuntis-photos.js` (new): the export tool. It depends on WebUntis's undocumented web pages and may need adapting after a WebUntis update.
- `i18n/` (BabelEdit files): the new texts in German and English.
- Database size grows by roughly 5 KB per photo, about 10 MB for the whole school. The backups carry the photos too, so a deleted photo leaves the backups only as they rotate.
- No new npm dependency: images are validated by their header on the server and scaled in the browser.
