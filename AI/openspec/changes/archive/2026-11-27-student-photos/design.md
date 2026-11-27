## Context

The module knows a student only as a directory username with given and family name (`exam/roster-source.js`, `entry()`). Every list renders a name with `displayPerson` or `personName` from `exam/client/classes.js`. The places this change touches are:

- `exam/client/gradebook.js`: the sheet's name cell (`nameCell`) and the student page's heading.
- `exam/client/live.js`: the participant rows of online and offline sittings, with the attendance and group controls of an offline sitting.
- `exam/client/tests.js`: the correction table of a test on paper (`correctionTables`).

What we found about the sources on 2026-11-27 (see proposal.md):

- The on-prem AD has no photos. A probe with temporary binary mappers found `thumbnailPhoto`/`jpegPhoto` on 0 of 2,261 accounts, against `objectGUID` on 300 of 300.
- WebUntis shows the photos in the class register of a lesson. `classregpage.do?ttid=…` is an HTML page that loads `GET /WebUntis/image.do?cat=5&id=<untis id>&useWhiteAvatarDefault=true` once per student. The images are JPEG, 134 × 200 px, 3–7 KB, and authorised by the session cookie alone. A click only enlarges the same image: there is no larger one. The JSON `calendar-entry/detail` carries `students: []`, so the mapping of a WebUntis id to a name lives in the class register's HTML.
- The platform API WebUntis documents for partners lists master data for students, but no photos.

The module stores everything in one SQLite file on the persistent volume, which is backed up before migrations and while it runs (`exam-foundation`). Translations are BabelEdit JSON files in `i18n/`.

## Goals / Non-Goals

**Goals:**
- A source-independent store: safeLearn imports photos and never talks to WebUntis.
- One shared element for a person in a list, so a later seating plan reuses it as is.
- No new npm dependency.

**Non-Goals:**
- A seating plan. It is parked in `AI/open-proposals.md` and builds on the shared element.
- An automatic or scheduled sync with WebUntis. The export runs by hand, about once a school year.
- Photos anywhere a student can see them, and photos of teachers.
- Photos larger than 600 px. WebUntis offers 134 × 200, and other sources are scaled down.

## Decisions

### D1: The photos live in the exam database as BLOBs, not as files

A table `student_photo (username TEXT PRIMARY KEY, image BLOB NOT NULL, mime TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, imported_at TEXT NOT NULL, imported_by TEXT NOT NULL)` in migration `025-student-photos.sql`.

*Why:* the module's data is one file on one volume, with one backup and one restore path (see the memory note about restoring the secureLectures exam DB). About 5 KB per photo is about 10 MB for the whole school, which is small for SQLite.

*Alternative:* a directory `data/student-photos/<username>.jpg`. That would mean a second thing to back up, a path-traversal surface built from usernames, and files that outlive a deleted row. Rejected.

### D2: One photo route behind the role `student-images`, with a version in the URL

`GET /exam/photos/:username?v=<version>` answers the image with `Cache-Control: private, max-age=31536000, immutable`. Without a photo it answers `404`. The version is `imported_at` reduced to a short token.

The gate is a new `holdsStudentImages(req)` in `exam/gate.js`. It asks whether the permission context's **full** role set (`context.full.roles`, the merged Keycloak client roles and LDAP groups) holds `student-images`. It does **not** go through `hasSomeRoles`, because that lets an admin pass every role check (`view.isAdmin`), and Gerald's rule is that only the role decides. The student-view downgrade is not applied: the role is not a teacher role, and every page that shows photos is a teacher page anyway, which the downgrade already closes. Without the role the route answers `403`. The import routes additionally require `actsAsAdmin`. The client role lives on the instance's Keycloak client: `safeLearn` in the demo realm, the instance's own client in secureLectures. `student-images` joins the names reserved for roles in `permission-context.js`, so a display name can never stand in for it.

The three list payloads get a field `photo` per row: the version, or `null`. It is added in the routes that answer the lists (`routes-gradebook.js`, `routes-live.js` with its event stream, `routes-paper.js`), by one query per answer over the rows' usernames (`withPhotoVersions` in `exam/photos.js`), not by a `LEFT JOIN` in each list's own queries: the routes are where the session is known, and the list functions stay free of it. It is never the image itself. For a session without `student-images` the field is left out of every row, so the payload does not even reveal which students have a photo. The class's screen (`?screen=1`) shows no names and gets no photo either.

*Why:* with the version in the URL, a replaced photo has a new URL and the browser fetches it again (spec: "A photo is replaced"). Every other view is answered from the browser cache without a request, and a `null` row asks for nothing. That keeps a sheet of 30 students from making 30 requests on every reload.

*Alternative:* embed the photos as data URLs in the payloads. That would make every poll of the live view many times larger. Rejected.

### D3: One shared element for a person, `personLabel(person)`, in `classes.js`

It renders a photo (`<img loading="lazy" decoding="async" alt="">`, a fixed size per context through a CSS custom property) or the initials (`<span aria-hidden="true">`), then what `personName` renders today, the candidate marking included. The image's `alt` stays empty because the name stands right beside it: a screen reader would otherwise read it twice. Enlarging on hover or focus is CSS (`:hover`/`:focus-visible` on a wrapper with `tabindex="0"`), which shows the image at its natural size in a positioned layer. It needs no script and no dialog.

The places in Context switch from `displayPerson`/`personName` to it where a row's name is rendered. The `aria-label` texts that use `displayPerson` stay as they are.

*Why:* one element keeps the look identical everywhere, and the seating plan's cards later reuse it as they are.

### D4: The import matches in the browser's preview, and the server stores only what was confirmed

The page `/exam/photos` (`actsAsAdmin` and `holdsStudentImages`; any other session gets the module's "nothing here" answer) works in three steps:

1. **Read**: the browser reads the export file (JSON) or the chosen image files. It scales each image with a canvas to at most 600 px on the longer side, re-encoding as JPEG only when it scaled.
2. **Match**: `POST /exam/api/photos/match` sends only the metadata, never images: `[{key, file, class, familyName, givenName}]`. The server matches against `heldDirectoryPeople()`. A file name equal to a username wins. Otherwise it compares normalised class, family name and given names: lowercase, NFD with accents stripped, given names as a set. Teachers are never candidates, the rule `roster-source.js` already applies. The answer is `matched`/`ambiguous` (with candidates)/`unmatched` per key.
3. **Store**: `PUT /exam/api/photos/:username` with the image as body, one request per confirmed match. The server checks the header (JPEG SOI + SOF, or PNG IHDR), the size (≤ 256 KB) and the dimensions (≤ 600 px), and upserts. It stores only for a student the held directory knows, never for a teacher or an unknown username.

The page's other data are `GET /exam/api/photos/summary` and `POST /exam/api/photos/delete` (`{ scope, className, expected }`). A deletion names the number the admin confirmed; the server refuses it with `409` when the number no longer fits, so nothing is deleted the admin was not told of. The import's API lives under `/exam/api/` like every other API of the module; only the image itself is at `/exam/photos/:username`. A match request takes at most 500 entries, so the page sends a whole school in parts within the instance's JSON limit.

*Why:* matching on the server uses the directory the server already holds, and the admin sees the result before anything is written (spec: "confirms the matching before anything is stored"). Scaling in the browser avoids an image library on the server. One request per photo keeps every body small and lets the page show progress.

*Alternative:* upload a ZIP and process it on the server. That needs an unzip dependency or a hand-written ZIP reader, and a large upload. Rejected.

### D5: The export format is a JSON file with data URLs

```json
{ "format": "safelearn-student-photos", "version": 1, "source": "webuntis",
  "exportedAt": "2026-11-27T18:00:00Z",
  "students": [ { "class": "5AHIF", "familyName": "…", "givenName": "…",
                  "sourceId": "…", "image": "data:image/jpeg;base64,…" } ] }
```

At 134 × 200 a class of 30 is about 200 KB, and all of a teacher's classes are a few MB. The import page reads this format and plain image files through the same steps.

### D6: The export tool is a script pasted into the teacher's WebUntis tab

`tools/webuntis-photos.js` is plain browser JavaScript. The teacher opens WebUntis, opens the developer console and pastes the script. It reads the class register pages the teacher can open, fetches `image.do` for each student with the session cookie the tab already has (same origin, `credentials: "same-origin"`), and offers the export file as a download through a Blob URL. It sends nothing anywhere but to WebUntis.

**Where the students come from (task 1.1, settled on 2026-11-27 with Gerald logged in, structure only):**

- Opening a lesson's class register loads `classregpage.do?ttid=…`, which renders in a frame at `/WebUntis/embedded.do`. Its student list is DOM, not JSON. Every student is a `div.studentCard__container` (with `CRSWAbsent` added for an absent student). It holds `div.studentCard__imageColumn > div.studentCard__image > div.grupetWidgetImageLoader > img[src*="image.do?cat=5&id=<untis id>"]`.
- The card's text is two lines: **family name, then given name**.
- The lesson's class comes from the JSON `calendar-entry/detail` loaded just before it (`calendarEntries[0].klasses[].shortName`).
- Checked against the realm on 4BHIF and 5AHIF: 54 of 54 cards matched exactly one directory person in the class's OU with family name first, with no ambiguous and no unmatched card. The order "given name first" matched none.

So the tool reads `.studentCard__container` cards in the register frame: the `id` from the image's URL, the two text lines as family and given name, the class from the lesson. It then fetches `image.do` itself, so it does not rely on what the page happened to load. It works per lesson, so a class is exported by opening one of its lessons. A class without a lesson in the visible week cannot be read until it has one: that is how WebUntis offers the register, not a limit of the tool. The tool gets its own short `tools/webuntis-photos.md`, which also says it depends on undocumented pages.

A first export of 4BHIF and 5AHIF exists outside the repo at `~/webuntis-photos/export-2026-11-27.json` (54 students, 326 KB) on Gerald's workstation, for testing the import in secureLectures.

*Alternative:* a Puppeteer script like the probe of 2026-11-27, which opens its own browser where the teacher logs in. That is more robust to drive, but needs Node and a checkout of the repo. Kept as a fallback if the console script turns out to need navigation that a pasted script cannot do.

### D7: Deleting is explicit; the directory refresh deletes nothing by itself

Photos whose username the held directory no longer contains are *listed* on the page and deleted only by the admin (spec: "An admin sees and removes the photos the module holds"). A refresh of the directory never deletes photos on its own.

*Why:* the held directory can be incomplete, for example a fetch that died (`directory-fetch-status`) or the provider split of 2026-09-13. Deleting on a temporary gap would destroy photos that cost a manual export to get back. The admin sees the number first and confirms it.

## Risks / Trade-offs

- [WebUntis changes `classregpage.do` or `image.do`] → Only the export tool breaks. safeLearn and its stored photos do not, and the tool is adapted when it is next needed (about once a year). Its document names the two endpoints it relies on.
- [Photos live on in backups after deletion] → The page says so (spec). The backups rotate. A strict deletion would also need the backups pruned, which is out of scope, and the page tells the admin that.
- [Ambiguous names across a class] → The preview lists them and the admin picks. Nothing ambiguous is stored silently.
- [A student changes class during the year] → A match uses the class only to find the person. The photo is stored per username and follows the person.
- [Lazy images in a long sheet scroll in late] → The images are small, and the browser cache answers after the first view. Acceptable.
- [The hover enlargement covers neighbouring cells in the sheet] → The layer is positioned beside the photo and closes when the pointer or focus leaves. It is not shown in print.

## Migration Plan

1. Migration `025-student-photos.sql` adds the empty table. The module backs up the database before the migration, as it does before every one. Rollback: the table can stay. The previous code ignores it.
2. Deploy to safeLearn (the demo instance) and run the import with an export from the demo realm's test accounts (pictures generated for them, no real students).
3. Merge into secureLectures. Gerald runs the export tool in his WebUntis session and imports his classes there.

