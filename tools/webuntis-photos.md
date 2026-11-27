# Exporting student photos from WebUntis

`tools/webuntis-photos.js` exports the official student photos from WebUntis into one file that safeLearn's photo import (`/exam/photos`) reads (`student-photos`). A teacher runs it in their own logged-in WebUntis tab, about once a school year.

## What it does and does not do

- It uses only the session of the tab it runs in. It never asks for, stores or sends a password or token of its own.
- Every request it makes goes to WebUntis, the tab's own origin. It sends nothing to safeLearn or anywhere else. The export is a file the browser saves.
- It reads what the class register shows you: the class, each student's family and given name, and the photo. Nothing else.

## Running it

1. Log into WebUntis in a desktop browser (Firefox or a Chromium browser).
2. Open the developer console of that tab (F12, then "Console"). Firefox asks you to type `allow pasting` once before it accepts pasted code.
3. Paste the whole content of `tools/webuntis-photos.js` and press Enter. A panel "safeLearn photo export" appears at the top right.
4. For each class:
   1. Open the class register of one of the class's lessons (the page with the students' cards and photos). Pick a lesson of that class alone. A lesson shared by several classes mixes their students.
   2. The panel fills in the lesson's class ("Detect class" asks again). Check it, or type it, for example `5AHIF`.
   3. Press "Add this register". The panel lists the class with the number of students found and the number without a photo. A class added again replaces its earlier entry. "×" removes it.
5. Press "Download export". The browser saves `webuntis-photos-<date>.json`.
6. In safeLearn, open `/exam/photos` (an admin holding the client role `student-images`) and choose that file.

A class can only be exported through one of its lessons in the visible week, because WebUntis offers the register per lesson.

The file holds photos of real students. Keep it only until it is imported, and then delete it.

## What it relies on

WebUntis documents none of these pages. A WebUntis update may change them, and the tool then needs adapting. safeLearn and the photos it has already stored are not affected.

- **The register's student cards.** Every student is a `div.studentCard__container` in the register's frame (`/WebUntis/embedded.do`, loaded by `classregpage.do`). The card's photo is an `img` whose `src` holds `image.do?cat=5&id=<WebUntis id>`. Its text is two lines, **family name first**, then given name.
- **`/WebUntis/image.do?cat=5&id=<id>&useWhiteAvatarDefault=false`.** The photo, JPEG, 134 × 200 px, authorised by the session cookie. The tool fetches it itself rather than relying on what the page has loaded. A picture that several students of one register share is WebUntis's placeholder, and those students count as without a photo.
- **`calendar-entry/detail`.** The JSON the timetable loads for a lesson. Its `calendarEntries[0].klasses[].shortName` names the lesson's class. The tool asks the most recent such request again, with the session's bearer token from `/WebUntis/api/token/new` if WebUntis wants one. When that fails, type the class yourself.

The format of the export is `student-photos` design D5: `{ "format": "safelearn-student-photos", "version": 1, "source": "webuntis", "exportedAt", "students": [{ "class", "familyName", "givenName", "sourceId", "image": "data:image/jpeg;base64,…" }] }`. Students without a photo are left out of it.
