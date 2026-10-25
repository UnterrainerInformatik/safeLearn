## MODIFIED Requirements

### Requirement: An attachment is served where at least one of its references is visible

An attachment in the corpus SHALL be served to a session only when that session may see at least one place in the corpus that references it. A place SHALL count as visible when the session may see the Markdown file it is in, under the whole-file directive with its time windows, and, where the reference sits inside an inline `@@@` block, may also see that block under the same rules the rendered page applies to it: its roles, its time windows, the view pseudo-roles, and the student-view downgrade. A reference is any way a rendered page addresses the attachment: an embed (`![[name]]`), an image, a link, or a wiki link (`[[name]]`, `[[name|text]]`) that resolves to the attachment.

A handout the exam module currently serves to a session (`exam-handout`) SHALL count as a visible place for that session as well, with its whole-file directive set aside and its inline blocks decided under the views the handout rendering fixes. It SHALL count only while the module would serve the handout to that session. When the window closes, the sitting ends, or the participant is marked absent or moved to the other group, it SHALL stop counting from that moment on, not after a grant's lifetime.

#### Scenario: Referenced from an unrestricted page

- **WHEN** an attachment is referenced on a page that carries no directive, outside any `@@@` block
- **THEN** it is served to every authenticated session

#### Scenario: Referenced only inside a teacher block

- **WHEN** an attachment is referenced only inside a `@@@ teacher` block, and a student session requests it
- **THEN** it is not served
- **AND** a teacher session requesting it is served

#### Scenario: Referenced in several places with different restrictions

- **WHEN** an attachment is referenced on a page restricted to teachers, inside a `4bhif` block on another page, and on an unrestricted page
- **THEN** it is served to every authenticated session, because the unrestricted page is visible to each of them
- **AND** if the reference on the unrestricted page is removed, it is served only to teachers and to members of `4bhif`

#### Scenario: The only visible reference is inside a closed time window

- **WHEN** an attachment's only reference visible to a session sits in a block whose time window is not open at the moment of the request
- **THEN** it is not served to that session

#### Scenario: A teacher in student view

- **WHEN** a teacher who has switched to the student view requests an attachment referenced only in teacher-only places
- **THEN** it is not served, exactly as the teacher's rendered pages do not show it

#### Scenario: Referenced only in the exam variant

- **WHEN** an attachment is referenced only inside a block gated by the exam view, and a session without that view requests it
- **THEN** it is not served

#### Scenario: Referenced by a wiki link

- **WHEN** an attachment is referenced only by a wiki link `[[handout.pdf]]` on an unrestricted page, outside any `@@@` block
- **THEN** it is served to every authenticated session
- **AND** if that wiki link is moved inside a `@@@ teacher` block, it is no longer served to a student session

#### Scenario: Referenced by a handout during the window

- **WHEN** an attachment is referenced only in a handout restricted to teachers, inside its `#exam` block, and a present participant of the open sitting requests it
- **THEN** it is served to that participant
- **AND** it is not served to an absent participant or to a student of another class

#### Scenario: The participant is marked absent during the window

- **WHEN** a participant who was served the handout's image is marked absent and requests the image again
- **THEN** it is not served
