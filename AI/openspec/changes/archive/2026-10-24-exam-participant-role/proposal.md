## Why

A class's Matura candidates in a subject are marked in Keycloak by hand today, outside the application, and nothing in the exam module shows who they are. The teacher who keeps the course's gradebook is the one who knows, so the gradebook should be where the marker is set and taken away. Once set, the module should make those students stand out wherever they appear, since they are the ones the teacher has to keep an eye on.

## What Changes

- The course gradebook gets a toggle per student that grants or withdraws the Keycloak client role `examparticipant-<subject>` on the `safeLearn` client, the subject being the course's subject in lower case (`examparticipant-wmc` for a course `WMC`).
- When the role does not exist on the `safeLearn` client yet, the first grant creates it.
- The directory-service client (`DIRECTORY_SERVICE_CLIENT_ID`), until now read-only by design, is given the rights to assign client roles to users and to create roles on the `safeLearn` client. No new client, no new secret. An instance whose directory-service client keeps only `view-users`/`view-events` can show the holders but cannot change them, and says so.
- Holders of a course's role are highlighted in every exam-module view that shows students of that course: a coloured name cell in tables (the gradebook sheet, the student page navigation, the live view, the tests' participant lists), a different text colour elsewhere. The class roster highlights a student who holds the role of any of the class's courses.
- Out of scope: what the role makes visible in documents. That is already decided by the renderer's role directives (`role-resolution`) and does not change.

## Capabilities

### New Capabilities
- `exam-participant-role`: granting and withdrawing a course's exam-participant role from the gradebook, creating the role when missing, the write rights this needs on the directory-service identity, and highlighting the role's holders across the exam module.

### Modified Capabilities

## Impact

- `middlewares/directory-service.js`: admin-API calls to read, create and map a client role; the held directory updated in place after a change, so the highlight follows at once instead of after the next fetch.
- `exam/routes-gradebook.js` (or a new small router): endpoint to grant/withdraw for a course and a student on its roster; the course and roster answers carry who holds the role.
- `exam/client/gradebook.js`, `exam/client/classes.js`, `exam/client/live.js`, `exam/client/tests.js`, `css/exam.css`, `i18n/de.json`, `i18n/en.json`.
- `docs-keycloak.md`: the directory-service client's roles change from read-only to `view-users`, `view-events`, `manage-users` and the right to manage the `safeLearn` client's roles. Every deployment (the shared demo realm used by `npm test`, the `unterrainer` realm behind secureLectures) needs that change in Keycloak before the toggle works.
- Tests in `test/exam.test.js` write role mappings to the shared demo realm and remove them again.
