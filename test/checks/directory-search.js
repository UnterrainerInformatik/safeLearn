/**
 * `GET /api/admin/directory/search`: the caller's identity is proven by a
 * bearer token, introspected independently of the browser session; the
 * directory itself is matched by name or by role/group and mapped down to
 * `{ name, roles }`.
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

async function search(token, query) {
  const headers = {};
  if (token !== null && token !== undefined) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(
    `${applicationUrl}/api/admin/directory/search?q=${encodeURIComponent(query)}`,
    { headers }
  );
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
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

  test("a query matching nothing returns an empty list", async () => {
    const { status, body } = await search(teacherToken, "no-one-in-any-realm-is-named-this-4f2a7c");
    assert.equal(status, 200, `a query matching nothing should still succeed, got ${status}`);
    assert.deepEqual(body, [], "a query matching nothing should answer with an empty list, not an error");
  });
});
