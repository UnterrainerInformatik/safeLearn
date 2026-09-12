/**
 * `GET /api/admin/directory/search` and `GET /api/admin/directory/status`: the
 * caller's identity is proven by a bearer token, introspected independently of
 * the browser session; the directory itself is matched by name or by role/group
 * and mapped down to `{ name, roles }`, and its state is readable without
 * transferring any of it.
 *
 * Unlike every other check in this suite, this one calls the application
 * directly from the test process instead of through the browser page: the
 * endpoint is reached with an `Authorization` header, not a session cookie.
 * `test/harness.js`'s `accessToken` is the one place a token leaves the page,
 * scoped to this need.
 *
 * This is a module, not a test file: `test/content.test.js` imports it.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { accessToken, applicationUrl, displayName, roles, sharedSession } from "../harness.js";

/** Roles/groups that exist for every account and so prove nothing about the directory-wide search. */
const reservedRoleNames = new Set(["admin", "teacher", "teachers", "student", "students"]);

function bearer(token) {
  const headers = {};
  if (token !== null && token !== undefined) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function answerOf(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function searchOnce(token, query) {
  return answerOf(
    await fetch(`${applicationUrl}/api/admin/directory/search?q=${encodeURIComponent(query)}`, {
      headers: bearer(token),
    })
  );
}

/**
 * The endpoint answers `202` while it holds no directory data to match against
 * yet: it builds the realm's user list behind the request rather than holding
 * the request open across a fetch that takes minutes on a school-sized realm
 * (`show-directory-fetch-progress`). The contract is that a caller repeats the
 * same request, unchanged, until it is answered.
 *
 * The repeating follows the plugin's own rule rather than a plain timeout, so
 * that this check reports what actually went wrong. A `202` while the status
 * says a fetch is running is a wait; a `202` while it says none is, is a fetch
 * that died — the search is re-issued once more, which starts a new one, and a
 * third `202` after that says the fetch is not completing at all rather than
 * that it is slow. Without that distinction an instance whose directory-service
 * credentials are refused (see `AI/memory/directory-service-credentials-invalid.md`)
 * would sit out the whole bound and, worse, outlive the caller's own access
 * token, turning every later check into a spurious `403`.
 */
async function search(token, query) {
  const deadline = Date.now() + 30_000;
  let reissuedOnce = false;
  for (;;) {
    const answer = await searchOnce(token, query);
    if (answer.status !== 202) return answer;

    const state = await directoryStatus(token);
    if (state.status === 200 && state.body?.fetching === false) {
      assert.ok(
        !reissuedOnce,
        "the directory endpoint answers 202 while reporting no fetch running, twice running — the " +
          "fetch it starts is dying immediately rather than progressing. Check this instance's " +
          `DIRECTORY_SERVICE_CLIENT_ID/_SECRET against its realm. Status: ${JSON.stringify(state.body)}`
      );
      reissuedOnce = true;
      continue;
    }

    assert.ok(
      Date.now() < deadline,
      `the directory endpoint still answered 202 after 30s — the fetch it reports is not finishing: ${JSON.stringify(answer.body)}`
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function directoryStatus(token) {
  return answerOf(await fetch(`${applicationUrl}/api/admin/directory/status`, { headers: bearer(token) }));
}

/**
 * A syntactically valid access token whose signature has been broken —
 * standing in for one that is expired or revoked. Keycloak's introspection
 * endpoint answers `active: false` for all three the same way: none of them
 * currently hold a live session on the identity provider, which is the one
 * thing introspection reports.
 */
function invalidated(token) {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[2].length === 0) return `${token}x`;
  const signature = parts[2];
  const flipped = signature[0] === "A" ? "B" : "A";
  return `${parts[0]}.${parts[1]}.${flipped}${signature.slice(1)}`;
}

describe("directory search", () => {
  let teacher;
  let admin;
  let student;
  let teacherToken;
  let adminToken;
  let studentToken;
  let teacherName;
  let studentName;
  let teacherRoles;

  before(async () => {
    teacher = await sharedSession("teacher");
    admin = await sharedSession("admin");
    student = await sharedSession("student");

    [teacherToken, adminToken, studentToken] = await Promise.all([
      accessToken(teacher),
      accessToken(admin),
      accessToken(student),
    ]);
    assert.ok(teacherToken, "the teacher session should carry a bearer access token");
    assert.ok(adminToken, "the admin session should carry a bearer access token");
    assert.ok(studentToken, "the student session should carry a bearer access token");

    [teacherName, studentName] = await Promise.all([displayName(teacher), displayName(student)]);
    assert.ok(teacherName, "the teacher session should carry a display name");
    assert.ok(studentName, "the student session should carry a display name");

    // This realm grants roles as Keycloak client roles, not LDAP — the demo
    // instance has no LDAP federation at all, so `attributes.LDAP_ENTRY_DN` is
    // empty for every account (confirmed against the live realm). The teacher
    // account is the one that holds something distinctive this way (an exam
    // marker, a class), where the student account holds nothing beyond the
    // reserved roles session login itself contributes.
    teacherRoles = await roles(teacher);
  });

  // ---- 7.2 A teacher token searching by name ----

  test("a teacher token searching by the student's own display name finds them by name", async () => {
    const { status, body } = await search(teacherToken, studentName);
    assert.equal(status, 200, `the search should succeed for a teacher token, got ${status}`);
    assert.ok(Array.isArray(body), "the response should be a list");
    assert.ok(
      body.some((entry) => entry.name.toLowerCase().includes(studentName.toLowerCase())),
      `searching for "${studentName}" should find a person whose name contains it, got ${JSON.stringify(body)}`
    );
  });

  // ---- 7.2 A teacher token searching by role/group, including a value beyond class/teacher/admin ----

  test("a teacher token searching by a role/group value that is not a class or teacher/admin finds it", async () => {
    const distinctive = [...teacherRoles].find(
      (value) =>
        !reservedRoleNames.has(value) &&
        value !== teacher.username.toLowerCase() &&
        value !== teacherName.toLowerCase()
    );
    assert.ok(
      distinctive,
      "the shared demo teacher account should carry at least one client role beyond the reserved " +
        `names (e.g. a class or an exam marker); the roles it carried were: ${[...teacherRoles].join(", ")}`
    );

    const { status, body } = await search(teacherToken, distinctive);
    assert.equal(status, 200, `the search should succeed for a teacher token, got ${status}`);
    assert.ok(
      body.some((entry) => Object.keys(entry.roles ?? {}).includes(distinctive)),
      `searching for the role/group "${distinctive}" should find someone holding it, got ${JSON.stringify(body)}`
    );
  });

  // ---- 7.2 An admin token succeeds without holding teacher ----

  test("an admin token succeeds", async () => {
    const { status, body } = await search(adminToken, admin.username);
    assert.equal(status, 200, `the search should succeed for an admin token, got ${status}`);
    assert.ok(Array.isArray(body), "the response should be a list");
  });

  // ---- 7.2 A student token is refused ----

  test("a student token is refused", async () => {
    const { status, body } = await search(studentToken, "a");
    assert.notEqual(status, 200, `a student token should be refused, got ${status} with ${JSON.stringify(body)}`);
  });

  // ---- 7.2 A missing bearer is refused ----

  test("a request with no bearer token is refused", async () => {
    const { status, body } = await search(null, "a");
    assert.notEqual(status, 200, `a request with no bearer token should be refused, got ${status} with ${JSON.stringify(body)}`);
  });

  // ---- 7.2 An expired/revoked token is refused ----

  test("an invalidated token is refused the same way a missing one is", async () => {
    const { status, body } = await search(invalidated(teacherToken), "a");
    assert.notEqual(status, 200, `an invalidated token should be refused, got ${status} with ${JSON.stringify(body)}`);

    const missing = await search(null, "a");
    assert.equal(
      status,
      missing.status,
      "an invalidated token and a missing one should be refused indistinguishably"
    );
  });

  // ---- 7.2 A match's response carries only name and roles ----

  test("a match's response entry carries only name and roles", async () => {
    const { status, body } = await search(teacherToken, studentName);
    assert.equal(status, 200, `the search should succeed for a teacher token, got ${status}`);
    const match = body.find((entry) => entry.name.toLowerCase().includes(studentName.toLowerCase()));
    assert.ok(match, "the student should be found by their own display name");
    assert.deepEqual(
      Object.keys(match).sort(),
      ["name", "roles"],
      `a result entry should carry only name and roles, got ${JSON.stringify(Object.keys(match))}`
    );
  });

  // ---- plugin-admin-directory-ui: an empty query returns the whole directory ----

  test("an empty query returns the whole directory rather than an empty list", async () => {
    const { status, body } = await search(teacherToken, "");
    assert.equal(status, 200, `an empty query should still succeed, got ${status}`);
    assert.ok(Array.isArray(body), "the response should be a list");
    assert.ok(
      body.some((entry) => entry.name === teacherName),
      `an empty query should include the teacher account, got ${JSON.stringify(body)}`
    );
    assert.ok(
      body.some((entry) => entry.name === studentName),
      `an empty query should include the student account, got ${JSON.stringify(body)}`
    );
  });

  // ---- A query matching nothing returns an empty list ----

  // ---- show-directory-fetch-progress: the status endpoint, behind the same gate ----

  test("a teacher token reads the directory's state without searching it", async () => {
    const { status, body } = await directoryStatus(teacherToken);
    assert.equal(status, 200, `the status should be readable by a teacher token, got ${status}`);
    assert.ok(
      ["idle", "counting", "entries", "roles"].includes(body.phase),
      `the status should name which phase of a fetch is running, got ${JSON.stringify(body)}`
    );
    assert.equal(
      body.fetching,
      body.phase !== "idle",
      `"a fetch is running" and "the phase is not idle" are the same statement, got ${JSON.stringify(body)}`
    );
    assert.ok(
      body.total === null || typeof body.total === "number",
      `a total that is not known yet should be reported as absent, never guessed, got ${JSON.stringify(body)}`
    );
    assert.ok(
      body.entries === null || typeof body.entries === "number",
      `how many entries are held should be a count or absent, got ${JSON.stringify(body)}`
    );
    assert.equal(typeof body.skipped, "number", "how many records were skipped should be a count");
  });

  test("the status carries none of the directory's contents", async () => {
    const { body } = await directoryStatus(teacherToken);
    assert.deepEqual(
      Object.keys(body).sort(),
      ["builtAt", "done", "entries", "fetching", "phase", "skipped", "startedAt", "total"],
      `the status should carry figures about the directory and nothing from it, got ${JSON.stringify(body)}`
    );
    assert.ok(
      !Object.values(body).some((value) => Array.isArray(value) || (value !== null && typeof value === "object")),
      `no field of the status may carry a record or a list of them, got ${JSON.stringify(body)}`
    );
  });

  test("a student token is refused the status, indistinguishably from a request carrying none", async () => {
    const refusedStudent = await directoryStatus(studentToken);
    const refusedMissing = await directoryStatus(null);
    assert.notEqual(
      refusedStudent.status,
      200,
      `a student token should be refused the status, got ${refusedStudent.status} with ${JSON.stringify(refusedStudent.body)}`
    );
    assert.equal(
      refusedStudent.status,
      refusedMissing.status,
      "holding neither role and presenting no identity at all should be refused the same way"
    );
    assert.deepEqual(
      refusedStudent.body,
      refusedMissing.body,
      "and neither refusal may disclose anything about the directory's state that the other does not"
    );
  });

  test("a query matching nothing returns an empty list", async () => {
    const { status, body } = await search(teacherToken, "no-one-in-any-realm-is-named-this-4f2a7c");
    assert.equal(status, 200, `a query matching nothing should still succeed, got ${status}`);
    assert.deepEqual(body, [], "a query matching nothing should answer with an empty list, not an error");
  });
});
