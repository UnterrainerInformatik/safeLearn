## MODIFIED Requirements

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
