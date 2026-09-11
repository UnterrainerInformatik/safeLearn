/**
 * A regression guard for the Keycloak admin-API pagination fix in
 * `middlewares/directory-service.js`: `GET users` without an explicit page
 * answers at most `Constants.DEFAULT_MAX_RESULTS` (100) and says nothing
 * about there being more, so `fetchAllUserPages` asks for pages explicitly
 * until one comes back short. Nothing exercised that loop before this file.
 *
 * Unit-level, not a live-Keycloak check: `fetch` is stubbed here rather than
 * calling the shared demo realm, which holds far fewer than 100 accounts and
 * so could never exercise more than one page on its own
 * (`test/checks/directory-search.js` covers that realm's actual responses).
 */

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  fetchAllUserPages,
  fetchDirectoryUserPage,
  resolveCallerRoles,
  withDeadline,
} from "../middlewares/directory-service.js";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

/** A page of `count` distinct Keycloak-user-shaped objects, ids offset by `first`. */
function page(first, count) {
  return Array.from({ length: count }, (_, index) => ({ id: `user-${first + index}` }));
}

describe("fetchAllUserPages", () => {
  test("aggregates every user across more than one page", async () => {
    const pages = [page(0, 100), page(100, 100), page(200, 30)];
    let calls = 0;
    global.fetch = async (url) => {
      calls += 1;
      const requested = new URL(url);
      const first = Number(requested.searchParams.get("first"));
      const pageIndex = first / 100;
      assert.ok(pageIndex < pages.length, `unexpected page requested at first=${first}`);
      return { ok: true, json: async () => pages[pageIndex] };
    };

    const users = await fetchAllUserPages(async () => "token");

    assert.equal(calls, 3, "a short final page should stop the loop, not be mistaken for more");
    assert.equal(users.length, 230, "every user across all pages should be returned");
    assert.deepEqual(
      users.map((user) => user.id),
      [...pages[0], ...pages[1], ...pages[2]].map((user) => user.id),
      "users should come back in page order"
    );
  });

  test("stops after a single short page", async () => {
    global.fetch = async () => ({ ok: true, json: async () => page(0, 5) });

    const users = await fetchAllUserPages(async () => "token");

    assert.equal(users.length, 5, "a realm smaller than one page should not trigger a second request");
  });

  test("calls the token provider again for every page, not once for the whole loop", async () => {
    const pages = [page(0, 100), page(100, 30)];
    let tokenCalls = 0;
    global.fetch = async (url) => {
      const first = Number(new URL(url).searchParams.get("first"));
      return { ok: true, json: async () => pages[first / 100] };
    };

    await fetchAllUserPages(async () => {
      tokenCalls += 1;
      return "token";
    });

    assert.equal(tokenCalls, 2, "a token close to expiry on a later page must be refreshable, not fixed at the first page's token");
  });
});

describe("fetchDirectoryUserPage", () => {
  test("throws on a non-ok response rather than silently returning an empty page", async () => {
    global.fetch = async () => ({ ok: false, status: 500, json: async () => [], text: async () => "" });

    await assert.rejects(
      () => fetchDirectoryUserPage(0, "token"),
      /status 500/,
      "a failed admin-API page request should surface as an error, not as an empty (indistinguishable-from-last) page"
    );
  });
});

describe("resolveCallerRoles", () => {
  test("a caller whose only signal is the plural client role teachers is recognized as a teacher", () => {
    const { isAdmin, isTeacher } = resolveCallerRoles(undefined, ["teachers"]);
    assert.equal(isTeacher, true, "the plural client role should canonicalize to teacher, same as deriveRoles does for LDAP");
    assert.equal(isAdmin, false);
  });

  test("a caller holding admin is recognized as an admin", () => {
    const { isAdmin, isTeacher } = resolveCallerRoles(undefined, ["admin"]);
    assert.equal(isAdmin, true);
    assert.equal(isTeacher, false);
  });

  test("a caller holding neither teacher/teachers nor admin is recognized as neither", () => {
    const { isAdmin, isTeacher } = resolveCallerRoles(undefined, ["student", "examParticipant"]);
    assert.equal(isAdmin, false);
    assert.equal(isTeacher, false);
  });

  test("a teacher grant arriving only via the ldap claim's OU=Teachers still resolves, unaffected by the extraction", () => {
    const { isAdmin, isTeacher } = resolveCallerRoles("OU=Teachers,DC=example,DC=com", undefined);
    assert.equal(isTeacher, true, "the existing LDAP path should still work after moving into resolveCallerRoles");
    assert.equal(isAdmin, false);
  });
});

describe("withDeadline", () => {
  test("resolves with the wrapped promise's value when it settles before the deadline", async () => {
    const result = await withDeadline(Promise.resolve("done"), 1000, "test");
    assert.equal(result, "done");
  });

  test("rejects once the deadline elapses, for a promise that never settles on its own", async () => {
    const neverSettles = new Promise(() => {});
    await assert.rejects(
      () => withDeadline(neverSettles, 10, "the slow thing"),
      /the slow thing did not complete within 10ms/,
      "a hung admin-API call (headers fine, body never finishes) must still release its caller"
    );
  });
});
