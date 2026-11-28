# student-photos Specification

## Purpose
Shows a teacher the official photo of each student beside the name in the exam module's lists, so the teacher can connect faces and names. The photos are imported from WebUntis by an admin, stored in the module's database and served only to teachers.

## Requirements

### Requirement: The module holds at most one photo per student, keyed by directory username

The exam module SHALL store at most one photo per directory username, in its own database. Along with each photo it SHALL record the image format, the width and height in pixels, when it was imported and by whom. A photo SHALL be a JPEG or PNG image of at most 256 KB, and at most 600 px on its longer side. The server SHALL refuse anything else with `400`, judged by the image's own header and not by its file name. Importing a photo for a username that already has one SHALL replace it.

#### Scenario: A photo is imported for a student without one

- **WHEN** an admin imports a 134 × 200 JPEG for the username `mmuster`
- **THEN** the module holds exactly one photo for `mmuster`, recorded as JPEG, 134 × 200, with the time and the admin's username

#### Scenario: A second import replaces the first

- **WHEN** an admin imports a photo for `mmuster`, who already has one
- **THEN** the module holds only the new photo for `mmuster`

#### Scenario: A file that is not an image is refused

- **WHEN** an upload named `mmuster.jpg` carries bytes that are no JPEG or PNG image
- **THEN** the server answers `400` and stores nothing for `mmuster`

### Requirement: Only a session holding the client role `student-images` receives a photo

A photo SHALL be served only through the module's photo route, and only to a session whose roles hold the client role `student-images` of the instance's Keycloak client **and** that sees a class whose roster holds the student. A roster entry marked as left SHALL count. A session acting as an admin sees every class (`class-teachers`), so an admin holding `student-images` SHALL receive every photo. The role SHALL remain necessary: being a teacher or an admin SHALL NOT be enough on its own, and the usual rule that an admin passes every role check SHALL NOT apply here. A session without `student-images` SHALL receive `403` with no image data. A session holding the role that sees no class with the student on its roster SHALL receive `404`, the same as for a username without a photo, so it cannot tell whether a photo exists. The photo SHALL be sent with caching that keeps it private to the browser: shared caches never store it. No photo SHALL be reachable as a static file.

#### Scenario: A teacher with the role requests a photo

- **WHEN** a session holding `student-images` and entered in `5AHIF` requests the photo of `mmuster`, who is on the roster of `5AHIF` and has a photo
- **THEN** the answer is `200` with the image and a `Cache-Control` that includes `private`

#### Scenario: A teacher with the role requests a photo of another class

- **WHEN** a session holding `student-images` but not entered in any class with `mmuster` on its roster requests the photo of `mmuster`, who has one
- **THEN** the answer is `404` and carries no image data

#### Scenario: An admin with the role requests any photo

- **WHEN** a session acting as an admin and holding `student-images` requests the photo of `mmuster`, while it is entered in no class
- **THEN** the answer is `200` with the image

#### Scenario: A teacher without the role requests a photo

- **WHEN** a session acting as a teacher but not holding `student-images` requests a photo
- **THEN** the answer is `403` and carries no image data

#### Scenario: An admin without the role requests a photo

- **WHEN** a session holding `admin` but not `student-images` requests a photo
- **THEN** the answer is `403`

#### Scenario: A student requests a photo

- **WHEN** a session without `student-images` requests the photo of any username, their own included
- **THEN** the answer is `403`

#### Scenario: A student without a photo

- **WHEN** a session holding `student-images` requests the photo of a student of its own class who has none
- **THEN** the answer is `404`

### Requirement: The photo appears beside the name in the module's lists

Where the module lists students for a session that receives their photos, each row SHALL show the student's photo before their name, at a size that fits the row, and SHALL show the initials of the family and given name in the same place and size when the student has no photo. The places SHALL be: the gradebook sheet's name column, the heading of a student's page in the gradebook, the live view of an online and of an offline sitting (including the participant list where attendance and group A/B are set), the correction table of a test on paper, and the roster of a class. Hovering or focusing a photo SHALL show it at its stored size. A Matura candidate's marking SHALL stay as it is, beside the photo. The payload of each of these lists SHALL carry, per row, whether a photo exists and a value that changes when it is replaced, so the browser requests only existing photos and requests a replaced one again. That value SHALL be present only for a row whose photo the photo route would serve to the session. For every other row, and for every row of a session without `student-images`, it SHALL be absent, and the row SHALL show the initials.

#### Scenario: A teacher without the role opens the sheet

- **WHEN** a teacher not holding `student-images` opens the gradebook sheet of a course with photos
- **THEN** every row shows initials, the payload says for no row that a photo exists, and the browser requests no photo

#### Scenario: The sheet of a class with photos

- **WHEN** a teacher holding `student-images` and entered in the course's class opens the gradebook sheet, and every student but one has a photo
- **THEN** every row shows a photo before the name, and the one row without a photo shows the student's initials instead
- **AND** the browser requests no photo for the student without one

#### Scenario: A photo is replaced

- **WHEN** an admin imports a new photo for a student and a teacher of the student's class then reloads the live view
- **THEN** the live view shows the new photo, not the cached old one

#### Scenario: Setting group A/B in an offline sitting

- **WHEN** a teacher of the class opens the participant list of an offline sitting with two groups
- **THEN** each participant's row shows the photo before the name, beside the attendance and group controls

#### Scenario: A teacher enlarges a photo

- **WHEN** a teacher hovers over or focuses a photo in any of these lists
- **THEN** the photo is shown at its stored size, for example 134 × 200

### Requirement: An admin imports photos and confirms the matching before anything is stored

The module SHALL offer an import page to a session that acts as an admin **and** holds `student-images`, and to nobody else. It SHALL accept either the export file of the WebUntis tool or a set of JPEG or PNG files. Image files SHALL be scaled down in the browser to at most 600 px on their longer side before upload. The page SHALL match every photo to a directory person who is not a teacher:

- a file whose name without extension equals a directory username SHALL match that username;
- otherwise the class, family name and given name SHALL match a directory person of that class, ignoring case, accents and the order of several given names.

Before storing anything, the page SHALL show three lists: what matched one person, what matched several people (with those people to choose from) and what matched nobody. Only the matches the admin confirms SHALL be stored. An ambiguous photo SHALL be stored only after the admin has picked its person. An unmatched one SHALL never be stored. The page SHALL report how many photos were stored.

#### Scenario: A clean import

- **WHEN** an admin uploads an export of class 5AHIF in which every student matches exactly one directory person of `5ahif`
- **THEN** the page lists them all as matched
- **AND** confirming stores one photo per student and reports the number stored

#### Scenario: Two students with the same name

- **WHEN** an export holds a photo whose class and name fit two directory people
- **THEN** the page lists it as ambiguous with both people to choose from
- **AND** it is stored only after the admin picks one, and then only for that person

#### Scenario: A student the directory does not know

- **WHEN** an export holds a photo whose class and name fit no directory person
- **THEN** the page lists it as unmatched, and confirming the import does not store it

#### Scenario: A file named after a username

- **WHEN** an admin uploads `mmuster.jpg` and `mmuster` is a directory username
- **THEN** the page matches it to `mmuster` without looking at class or name

#### Scenario: A teacher who is no admin

- **WHEN** a session holding `student-images` but not acting as an admin opens the import page or calls its routes
- **THEN** the page is answered as a path with nothing behind it, and the routes answer `403`

#### Scenario: An admin without the role

- **WHEN** a session acting as an admin but not holding `student-images` opens the import page or calls its routes
- **THEN** the page is answered as a path with nothing behind it, and the routes answer `403`

#### Scenario: A teacher in the directory

- **WHEN** an export holds a photo whose class and name match only a teacher
- **THEN** the page lists it as unmatched

### Requirement: An admin sees and removes the photos the module holds

The import page SHALL show how many photos the module holds, per class of the directory. It SHALL list the usernames whose photo has no person in the directory any more, as their count and, on request, their usernames. It SHALL let the admin delete those photos, the photos of one class, or all photos, each after a confirmation that states how many photos will be deleted. A deleted photo SHALL no longer be served from that moment on. It SHALL leave the module's backups only as they rotate, and the page SHALL say so.

#### Scenario: A student has left the school

- **WHEN** a photo is held for a username the directory no longer holds
- **THEN** the page counts it among the photos without a person
- **AND** deleting them removes that photo, and its route answers `404` from then on

#### Scenario: Deleting a class's photos

- **WHEN** an admin deletes the photos of class `5ahif` and confirms the stated number
- **THEN** no member of `5ahif` has a photo any more, and the photos of other classes are unchanged

### Requirement: A teacher exports photos from WebUntis with a tool of the project

The project SHALL provide a tool that a teacher runs in their own logged-in WebUntis browser session. For the classes the teacher picks, it SHALL read each student's class, family name, given name and photo from the pages WebUntis shows the teacher, and write a single export file that the import page accepts. The tool SHALL use only the teacher's existing session. It SHALL NOT ask for, store or send any credentials, and it SHALL send nothing anywhere but to WebUntis itself. It SHALL report how many students it found per class and for how many it got no photo. The project SHALL document how to run it and that it depends on WebUntis's undocumented web pages.

#### Scenario: Exporting one class

- **WHEN** a teacher logged into WebUntis runs the tool for class 5AHIF
- **THEN** it produces one export file holding class, names and photo of every student of 5AHIF that WebUntis shows with a photo
- **AND** it reports the number of students found and the number without a photo

#### Scenario: The export is imported

- **WHEN** an admin uploads that export file on the import page
- **THEN** the page reads it and shows its matching as for any import
