## 1. Keycloak access

- [x] 1.1 Add to `middlewares/directory-service.js`: resolve the application client's internal id (cached), read a client role by name, create it, and add/remove it for a user (D1), each through `withDeadline`/the directory-service token
- [x] 1.2 Map a 403 from Keycloak to a distinct "missing write rights" error, and treat a 409 on role creation as success
- [x] 1.3 Patch the held directory entry's `clientRoleNames` after a successful write and rewrite the disk cache (D4)
- [x] 1.4 Unit tests with a stubbed `fetch`: role exists, role missing on grant, role missing on withdraw, 403, 409

## 2. Endpoint and data

- [x] 2.1 Derive the course's role name (`examparticipant-` + lower-case subject) in one place on the server
- [x] 2.2 `PUT /exam/api/courses/:id/participants/:username` with `{ held }`: teacher/admin, open year, username on the current roster; answers the new state (D3)
- [x] 2.3 Add the `examParticipant` flag to gradebook rows, the gradebook student page and its neighbours, the tests' participant lists, the live snapshot and live change events; `examParticipantIn` to class roster entries (D5)

## 3. Views

- [x] 3.1 CSS class `sl-exam-participant` with light/dark tokens in `css/exam.css` (D6)
- [x] 3.2 Gradebook sheet: toggle column with `aria-pressed`, disabled while the directory holds nothing, hidden in a closed year and without directory credentials; error message beside the sheet
- [x] 3.3 Highlight the name in the gradebook sheet, the student page and its neighbour links, the tests' participant lists, the live view, and the class roster (with subjects on hover); not on the projector view
- [x] 3.4 i18n keys in `i18n/de.json` and `i18n/en.json` (BabelEdit format): toggle label, accessible "Matura candidate" label, missing-rights message

## 4. Documentation and verification

- [x] 4.1 `docs-keycloak.md`: the directory-service client's roles become `view-users`, `view-events`, `manage-users`, `manage-clients`; describe the pre-created-roles alternative
- [x] 4.2 `docs-exam-module.md` and `AI/architecture.md`: the toggle, the role name, the highlight
- [x] 4.3 Browser tests in `test/exam.test.js` against the demo realm: grant, highlight in gradebook and live view, not highlighted in another subject, withdraw; refused for a student session and for a username off the roster; cleanup of every mapping granted
- [x] 4.4 Run `npm test` and compare failures against HEAD (see memory `flaky-content-checks`)
