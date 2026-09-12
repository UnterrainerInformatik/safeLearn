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
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, test } from "node:test";

import {
  appendDirectoryFetchProgressPage,
  clearDirectoryFetchProgress,
  fetchAllUserPages,
  fetchDirectoryUserCount,
  fetchDirectoryUserPage,
  fetchLastUserAdminEventTime,
  isDirectoryCacheFresh,
  readDirectoryDiskCache,
  readDirectoryFetchProgress,
  resolveCallerRoles,
  withDeadline,
  withRetry,
  writeDirectoryDiskCache,
  writeDirectoryFetchProgressMeta,
} from "../middlewares/directory-service.js";

const originalFetch = global.fetch;
const directoryCacheFilePath = path.join("data", "directory-cache.json");
const progressMetaFilePath = path.join("data", "directory-fetch-progress.meta.json");
const progressPagesFilePath = path.join("data", "directory-fetch-progress.jsonl");

afterEach(() => {
  global.fetch = originalFetch;
  fs.rmSync(directoryCacheFilePath, { force: true });
  fs.rmSync(progressMetaFilePath, { force: true });
  fs.rmSync(progressPagesFilePath, { force: true });
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

    const { users, skipped } = await fetchAllUserPages(async () => "token");

    assert.equal(calls, 3, "a short final page should stop the loop, not be mistaken for more");
    assert.equal(users.length, 230, "every user across all pages should be returned");
    assert.deepEqual(skipped, [], "nothing failed, so nothing should be reported as skipped");
    assert.deepEqual(
      users.map((user) => user.id),
      [...pages[0], ...pages[1], ...pages[2]].map((user) => user.id),
      "users should come back in page order"
    );
  });

  test("stops after a single short page", async () => {
    global.fetch = async () => ({ ok: true, json: async () => page(0, 5) });

    const { users } = await fetchAllUserPages(async () => "token");

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

  test("retries a page that fails once, rather than losing every page already fetched", async () => {
    const pages = [page(0, 100), page(100, 30)];
    let secondPageAttempts = 0;
    global.fetch = async (url) => {
      const first = Number(new URL(url).searchParams.get("first"));
      if (first === 100) {
        secondPageAttempts += 1;
        if (secondPageAttempts === 1) {
          return { ok: false, status: 503, text: async () => "Service Unavailable" };
        }
      }
      return { ok: true, json: async () => pages[first / 100] };
    };

    const { users } = await fetchAllUserPages(async () => "token");

    assert.equal(secondPageAttempts, 2, "the failing page should have been retried, not given up on immediately");
    assert.equal(users.length, 130, "a transient failure on one page must not discard the pages already fetched");
  });

  test("resumes from a seeded checkpoint at nextFirst, rather than starting over at first=0", async () => {
    let calls = 0;
    global.fetch = async (url) => {
      calls += 1;
      const first = Number(new URL(url).searchParams.get("first"));
      assert.equal(first, 14200, "a resumed fetch must ask Keycloak for the next unfetched offset, not first=0");
      return { ok: true, json: async () => page(14200, 30) };
    };

    const seedUsers = page(0, 14200);
    const { users, skipped } = await fetchAllUserPages(async () => "token", {
      users: seedUsers,
      skipped: [],
      nextFirst: 14200,
    });

    assert.equal(calls, 1, "only the missing page should be fetched");
    assert.equal(users.length, 14230, "seeded users plus the newly-fetched page should both be present");
    assert.deepEqual(skipped, []);
  });

  test("never requests past targetCount, even for a page that would otherwise be full-size", async () => {
    // Live incident (2026-09-11, auth.htl-leonding.ac.at, 14,289 users): past the
    // real end of an LDAP-federated realm, Keycloak never answers a clean short
    // page - every offset there hangs individually instead, which bisection would
    // "resolve" one at a time forever without this bound. targetCount=230 stands
    // in for that real end; nothing at or past it may ever be requested.
    let calls = 0;
    global.fetch = async (url) => {
      calls += 1;
      const params = new URL(url).searchParams;
      const first = Number(params.get("first"));
      const max = Number(params.get("max"));
      assert.ok(first < 230, `must never request first=${first}, at or past targetCount`);
      if (first === 200) {
        assert.equal(max, 30, "the last page must be asked for exactly what's left (230-200), not a full 100");
      }
      return { ok: true, json: async () => page(first, Math.min(max, 230 - first)) };
    };

    const { users, skipped } = await fetchAllUserPages(async () => "token", {}, undefined, 230);

    assert.equal(calls, 3, "exactly 3 pages (100, 100, 30) should be requested, then the loop must stop on its own");
    assert.equal(users.length, 230);
    assert.deepEqual(skipped, []);
  });

  test("drops phantom skipped entries at or past targetCount inherited from an older checkpoint", async () => {
    // Simulates resuming a checkpoint written before targetCount-bounding existed:
    // its skipped list can carry a run of offsets past the real end (exactly what
    // the live incident's checkpoint looked like), which must not be reported.
    global.fetch = async () => {
      throw new Error("no request should be made - the resumed checkpoint is already at targetCount");
    };

    const { users, skipped } = await fetchAllUserPages(
      async () => "token",
      { users: page(0, 230), skipped: [{ offset: 230 }, { offset: 231 }], nextFirst: 230 },
      undefined,
      230
    );

    assert.equal(users.length, 230);
    assert.deepEqual(skipped, [], "skipped entries at/past targetCount are phantom artifacts, not real records");
  });

  test("caps a bisected page's width near targetCount too, so bisection never touches offsets past it", async () => {
    let maxOffsetRequested = 0;
    global.fetch = async (url) => {
      const params = new URL(url).searchParams;
      const first = Number(params.get("first"));
      const max = Number(params.get("max"));
      maxOffsetRequested = Math.max(maxOffsetRequested, first + max);
      assert.ok(first + max <= 230, `bisection must never probe past targetCount: first=${first}, max=${max}`);
      if (first === 200 && max === 30) {
        return { ok: false, status: 504, text: async () => "Gateway Timeout" };
      }
      return { ok: true, json: async () => page(first, Math.min(max, 230 - first)) };
    };

    const { users } = await fetchAllUserPages(async () => "token", { users: page(0, 200), nextFirst: 200 }, undefined, 230);

    assert.equal(maxOffsetRequested, 230, "bisection should recover exactly up to targetCount, never beyond it");
    assert.equal(users.length, 230);
  });

  test("isolates a single record that keeps failing instead of losing the whole page", async () => {
    // A 100-user realm whose one full-size (max=100) page request fails outright
    // — standing in for the live first=14200 case, where it's an unresolved
    // AbortSignal timeout rather than an HTTP error, but fetchAllUserPages reacts
    // to withRetry exhausting either way. Any narrower (non-brief) request that
    // still covers offset 37 fails the same way; a brief lookup at exactly that
    // offset succeeds, standing in for the one lightweight identity fetch
    // bisection falls back to. The next page (first=100) is a normal short
    // (empty) page, so the loop ends cleanly once bisection resolves the first.
    global.fetch = async (url) => {
      const params = new URL(url).searchParams;
      const first = Number(params.get("first"));
      const max = Number(params.get("max"));
      const brief = params.get("briefRepresentation") === "true";
      const coversOffset37 = first < 100 && first <= 37 && first + max > 37;
      if ((first === 0 && max === 100) || (coversOffset37 && !brief)) {
        return { ok: false, status: 504, text: async () => "Gateway Timeout" };
      }
      if (coversOffset37 && brief) {
        return { ok: true, json: async () => [{ id: "user-37", username: "broken.user" }] };
      }
      return { ok: true, json: async () => page(first, Math.max(0, Math.min(max, 100 - first))) };
    };

    const { users, skipped } = await fetchAllUserPages(async () => "token");

    assert.equal(skipped.length, 1, "exactly the one reproducibly-failing record should be reported as skipped");
    assert.deepEqual(skipped[0], { offset: 37, id: "user-37", username: "broken.user" });
    assert.equal(users.length, 99, "every other user on the page should still be recovered");
    assert.ok(
      !users.some((user) => user.id === "user-37"),
      "the skipped record itself must not appear in the recovered users"
    );
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

describe("withRetry", () => {
  test("succeeds without retrying when the first attempt succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        return "ok";
      },
      3,
      "test",
      0
    );
    assert.equal(result, "ok");
    assert.equal(attempts, 1);
  });

  test("retries after a failure and returns the value once an attempt succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("transient");
        return "ok";
      },
      3,
      "test",
      0
    );
    assert.equal(result, "ok");
    assert.equal(attempts, 3);
  });

  test("gives up after the given number of attempts and throws the last error", async () => {
    let attempts = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            attempts += 1;
            throw new Error(`failure ${attempts}`);
          },
          3,
          "test",
          0
        ),
      /failure 3/,
      "the caller should see why the last attempt failed, not the first"
    );
    assert.equal(attempts, 3, "should try exactly `attempts` times, no more and no fewer");
  });
});

describe("fetchDirectoryUserCount", () => {
  test("returns the count Keycloak's /users/count answers with", async () => {
    global.fetch = async (url) => {
      assert.ok(String(url).endsWith("/users/count"), `expected the count endpoint, got ${url}`);
      return { ok: true, json: async () => 8437 };
    };

    const count = await fetchDirectoryUserCount("token");
    assert.equal(count, 8437);
  });

  test("throws on a non-ok response rather than treating it as a count of 0", async () => {
    global.fetch = async () => ({ ok: false, status: 500 });

    await assert.rejects(() => fetchDirectoryUserCount("token"), /status 500/);
  });
});

describe("readDirectoryDiskCache / writeDirectoryDiskCache", () => {
  test("returns null when there is no cache file yet", () => {
    assert.equal(readDirectoryDiskCache(), null);
  });

  test("round-trips what was written", () => {
    const users = [{ name: "Ada Lovelace", roles: { teacher: true } }];
    writeDirectoryDiskCache(users, 1);

    const cache = readDirectoryDiskCache();
    assert.deepEqual(cache.users, users);
    assert.equal(cache.count, 1);
    assert.deepEqual(cache.skipped, [], "no skipped records were passed, so none should come back");
    assert.ok(Date.now() - cache.cachedAt < 1000, "cachedAt should be stamped at write time");
  });

  test("round-trips a skipped-records list alongside the users", () => {
    writeDirectoryDiskCache([], 1, [{ offset: 37, id: "user-37", username: "broken.user" }]);

    const cache = readDirectoryDiskCache();
    assert.deepEqual(cache.skipped, [{ offset: 37, id: "user-37", username: "broken.user" }]);
  });

  test("defaults skipped to an empty array for a cache written before that field existed", () => {
    fs.mkdirSync(path.dirname(directoryCacheFilePath), { recursive: true });
    fs.writeFileSync(directoryCacheFilePath, JSON.stringify({ count: 1, cachedAt: Date.now(), users: [] }));

    assert.deepEqual(readDirectoryDiskCache().skipped, []);
  });

  test("returns null for a file that isn't shaped like a cache, rather than throwing", () => {
    fs.mkdirSync(path.dirname(directoryCacheFilePath), { recursive: true });
    fs.writeFileSync(directoryCacheFilePath, JSON.stringify({ unrelated: true }));

    assert.equal(readDirectoryDiskCache(), null);
  });

  test("returns null for a file that isn't valid JSON, rather than throwing", () => {
    fs.mkdirSync(path.dirname(directoryCacheFilePath), { recursive: true });
    fs.writeFileSync(directoryCacheFilePath, "not json");

    assert.equal(readDirectoryDiskCache(), null);
  });
});

describe("readDirectoryFetchProgress / appendDirectoryFetchProgressPage / writeDirectoryFetchProgressMeta", () => {
  test("returns null when there is no checkpoint yet", () => {
    assert.equal(readDirectoryFetchProgress(), null);
  });

  test("round-trips pages appended across multiple calls, in order", () => {
    appendDirectoryFetchProgressPage(page(0, 100));
    writeDirectoryFetchProgressMeta(230, [], 100);
    appendDirectoryFetchProgressPage(page(100, 100));
    writeDirectoryFetchProgressMeta(230, [{ offset: 137, id: "user-137" }], 200);

    const progress = readDirectoryFetchProgress();
    assert.equal(progress.users.length, 200, "both appended pages should be present");
    assert.equal(progress.nextFirst, 200, "nextFirst should reflect the latest meta write, not a derived count");
    assert.equal(progress.targetCount, 230);
    assert.deepEqual(progress.skipped, [{ offset: 137, id: "user-137" }]);
    assert.deepEqual(
      progress.users.map((user) => user.id),
      [...page(0, 100), ...page(100, 100)].map((user) => user.id),
      "pages should come back in append order"
    );
  });

  test("clearDirectoryFetchProgress removes both files without throwing when nothing exists", () => {
    appendDirectoryFetchProgressPage(page(0, 10));
    writeDirectoryFetchProgressMeta(10, [], 10);

    clearDirectoryFetchProgress();
    assert.equal(readDirectoryFetchProgress(), null);

    assert.doesNotThrow(() => clearDirectoryFetchProgress());
  });

  test("returns null for a meta file that isn't shaped like a checkpoint, rather than throwing", () => {
    fs.mkdirSync(path.dirname(progressMetaFilePath), { recursive: true });
    fs.writeFileSync(progressMetaFilePath, JSON.stringify({ unrelated: true }));

    assert.equal(readDirectoryFetchProgress(), null);
  });
});

describe("fetchLastUserAdminEventTime", () => {
  test("returns the most recent event's time", async () => {
    global.fetch = async (url) => {
      assert.ok(String(url).includes("resourceTypes=USER"), "should filter to user-resource events");
      return { ok: true, json: async () => [{ time: 1234567890 }] };
    };

    assert.equal(await fetchLastUserAdminEventTime("token"), 1234567890);
  });

  test("returns null when the realm has no admin events recorded", async () => {
    global.fetch = async () => ({ ok: true, json: async () => [] });

    assert.equal(await fetchLastUserAdminEventTime("token"), null);
  });

  test("returns null (not a rejection) when Admin Events isn't available, e.g. missing view-events", async () => {
    global.fetch = async () => ({ ok: false, status: 403 });

    assert.equal(await fetchLastUserAdminEventTime("token"), null);
  });
});

describe("isDirectoryCacheFresh", () => {
  test("is never fresh when the stored count no longer matches Keycloak's current count", async () => {
    global.fetch = async () => ({ ok: true, json: async () => [{ time: 0 }] });

    assert.equal(await isDirectoryCacheFresh(100, Date.now(), 101, "token"), false);
  });

  test("is fresh when the count matches and no admin event happened since caching, even well past the age bound", async () => {
    const longAgo = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days, past the 24h age fallback
    global.fetch = async () => ({ ok: true, json: async () => [{ time: longAgo - 1000 }] });

    assert.equal(
      await isDirectoryCacheFresh(100, longAgo, 100, "token"),
      true,
      "admin-events evidence of 'nothing changed' should outweigh the plain age bound"
    );
  });

  test("is stale when the count matches but an admin event happened after caching", async () => {
    const cachedAt = Date.now() - 1000;
    global.fetch = async () => ({ ok: true, json: async () => [{ time: Date.now() }] });

    assert.equal(await isDirectoryCacheFresh(100, cachedAt, 100, "token"), false);
  });

  test("falls back to the plain age bound when admin-events can't be consulted", async () => {
    global.fetch = async () => ({ ok: false, status: 403 });

    assert.equal(
      await isDirectoryCacheFresh(100, Date.now(), 100, "token"),
      true,
      "recently cached and count matches - should stay fresh without admin-events"
    );
    assert.equal(
      await isDirectoryCacheFresh(100, Date.now() - 25 * 60 * 60 * 1000, 100, "token"),
      false,
      "older than the 24h fallback bound and count matches, but with no admin-events evidence either way"
    );
  });
});

// ################### Fetch progress and the non-blocking search (show-directory-fetch-progress) ###################

/**
 * A copy of the module with its own module-level state — the directory cache
 * and the fetch-progress record both live there, and a check that inherited the
 * previous one's would be asserting about whatever ran before it. A
 * cache-busting query is all ESM needs for that; nothing in this module (or in
 * `keycloak-middleware.js` behind it) runs at import time, so a second instance
 * costs nothing and connects to nothing.
 */
let freshModuleCounter = 0;
async function freshDirectoryService() {
  freshModuleCounter += 1;
  return import(`../middlewares/directory-service.js?case=${freshModuleCounter}`);
}

/** A Keycloak user shaped enough for `displayName` and `directoryUserRoles` to have something to read. */
function namedUser(first, index) {
  return { id: `user-${first + index}`, firstName: `First${first + index}`, lastName: `Last${first + index}` };
}

/**
 * Stubs `fetch` for a whole directory fetch: the user count, the admin-events
 * freshness check, the user pages, and one role-mappings lookup per user.
 * `onRequest` sees every request as it is served, which is how a check
 * observes the progress record *during* a phase rather than only after it.
 */
function stubWholeRealm(users, onRequest = () => {}) {
  global.fetch = async (url) => {
    const requested = new URL(url);
    const where = requested.pathname;
    onRequest(requested);
    if (where.endsWith("/users/count")) return { ok: true, json: async () => users.length };
    if (where.endsWith("/admin-events")) return { ok: true, json: async () => [] };
    if (where.endsWith("/role-mappings")) return { ok: true, json: async () => ({ clientMappings: {} }) };
    const first = Number(requested.searchParams.get("first"));
    const max = Number(requested.searchParams.get("max"));
    return { ok: true, json: async () => users.slice(first, Math.min(first + max, users.length)) };
  };
}

describe("getDirectoryStatus", () => {
  test("reports idle and no held data before anything has ever been fetched", async () => {
    const service = await freshDirectoryService();

    const status = service.getDirectoryStatus();
    assert.equal(status.fetching, false, "nothing has been started, so nothing should be reported as running");
    assert.equal(status.phase, "idle");
    assert.equal(status.entries, null, "no data held should be reported as absent, not as an entry count of 0");
    assert.equal(status.builtAt, null);
    assert.equal(status.skipped, 0);
  });

  test("reports the counting phase with no total, rather than a total it does not know yet", async () => {
    const service = await freshDirectoryService();
    // Held at the token grant, before Keycloak's user count has been asked for:
    // exactly the window in which no total exists to report.
    service.startDirectoryRefresh(() => new Promise(() => {}));

    const status = service.getDirectoryStatus();
    assert.equal(status.fetching, true);
    assert.equal(status.phase, "counting");
    assert.equal(status.total, null, "a total that isn't known yet must be reported as absent, never guessed");
    assert.ok(status.startedAt > 0, "a running fetch should say when it started");
  });

  test("reports the entries phase as the offset reached out of the realm's own count", async () => {
    const service = await freshDirectoryService();
    const users = Array.from({ length: 230 }, (_, index) => namedUser(0, index));
    const seen = [];
    stubWholeRealm(users, (requested) => {
      if (requested.pathname.endsWith("/users") && requested.searchParams.has("first")) {
        seen.push(service.getDirectoryStatus());
      }
    });

    await service.startDirectoryRefresh(async () => "token");

    assert.deepEqual(
      seen.map(({ phase, done, total }) => ({ phase, done, total })),
      [
        { phase: "entries", done: 0, total: 230 },
        { phase: "entries", done: 100, total: 230 },
        { phase: "entries", done: 200, total: 230 },
      ],
      "each page should advance `done` by the offset actually reached, against Keycloak's own count as the total"
    );
  });

  test("reports the roles phase against the number of users actually fetched", async () => {
    const service = await freshDirectoryService();
    const users = Array.from({ length: 30 }, (_, index) => namedUser(0, index));
    const seen = [];
    stubWholeRealm(users, (requested) => {
      if (requested.pathname.endsWith("/role-mappings")) seen.push(service.getDirectoryStatus());
    });

    await service.startDirectoryRefresh(async () => "token");

    assert.equal(seen.length, 30, "every user should have been resolved");
    assert.ok(
      seen.every((status) => status.phase === "roles" && status.total === 30),
      `the role-mappings pass should report itself as its own phase against its own total: ${JSON.stringify(seen[0])}`
    );
    assert.ok(
      seen.every((status, index) => status.done <= index + 1),
      "`done` counts users finished, so it can never run ahead of the lookups started"
    );
  });

  test("reports what is held once a fetch completes, and that nothing is running any more", async () => {
    const service = await freshDirectoryService();
    stubWholeRealm(Array.from({ length: 30 }, (_, index) => namedUser(0, index)));

    await service.startDirectoryRefresh(async () => "token");

    const status = service.getDirectoryStatus();
    assert.equal(status.fetching, false, "a finished fetch must not still read as running");
    assert.equal(status.phase, "idle");
    assert.equal(status.entries, 30);
    assert.equal(status.skipped, 0);
    assert.ok(Date.now() - status.builtAt < 5000, "the data was just built, and should say so");
  });

  test("resets to idle after a failed fetch, rather than leaving a figure that can never advance", async () => {
    const service = await freshDirectoryService();
    global.fetch = async () => ({ ok: false, status: 500, text: async () => "" });

    await assert.rejects(() => service.startDirectoryRefresh(async () => "token"), /status 500/);

    const status = service.getDirectoryStatus();
    assert.equal(status.fetching, false, "an abandoned fetch must not leave a stale 'running' state behind");
    assert.equal(status.phase, "idle");
    assert.equal(status.entries, null, "nothing was fetched, so nothing should be reported as held");
  });

  test("does not start a fetch just because the status was asked for", async () => {
    const service = await freshDirectoryService();
    global.fetch = async () => {
      throw new Error("reading the status must never reach Keycloak");
    };

    for (let i = 0; i < 3; i++) assert.equal(service.getDirectoryStatus().fetching, false);
  });
});

describe("searchDirectory", () => {
  test("reports 'not ready' and starts a fetch when nothing is held at all", async () => {
    const service = await freshDirectoryService();
    // Removed for the duration so the fetch this starts fails at once, locally,
    // instead of reaching for whatever realm the environment happens to name -
    // what is under test is that a fetch was started, not that it succeeded.
    const clientId = process.env.DIRECTORY_SERVICE_CLIENT_ID;
    delete process.env.DIRECTORY_SERVICE_CLIENT_ID;
    try {
      const answer = await service.searchDirectory("ada");

      assert.equal(answer.ready, false, "a cold cache is neither a result nor a failure");
      assert.equal(answer.results, undefined, "'not ready' must not be dressed up as an empty match");
      assert.equal(answer.status.fetching, true, "a repeated search must be waiting on something that will happen");
      assert.equal(answer.status.phase, "counting");
    } finally {
      if (clientId === undefined) delete process.env.DIRECTORY_SERVICE_CLIENT_ID;
      else process.env.DIRECTORY_SERVICE_CLIENT_ID = clientId;
    }
  });

  test("answers 'not ready' immediately while a fetch is running, instead of waiting for it", async () => {
    const service = await freshDirectoryService();
    service.startDirectoryRefresh(() => new Promise(() => {}));

    const answer = await service.searchDirectory("");

    assert.equal(answer.ready, false);
    assert.equal(answer.status.fetching, true);
    assert.equal(answer.status.phase, "counting", "the answer should carry the running fetch's own progress");
  });

  test("answers a repeated search with its results once the fetch has completed", async () => {
    const service = await freshDirectoryService();
    stubWholeRealm(Array.from({ length: 30 }, (_, index) => namedUser(0, index)));

    const running = service.startDirectoryRefresh(async () => "token");
    // Asked while that fetch is still running: `searchDirectory` decides
    // synchronously, so this is the cold answer regardless of how far the fetch
    // has got by the time the promise is awaited.
    const tooEarly = service.searchDirectory("First7");
    assert.equal((await tooEarly).ready, false, "nothing is held yet");
    await running;
    const answer = await service.searchDirectory("First7");

    assert.equal(answer.ready, true, "the same search, unchanged, should now be answerable");
    assert.deepEqual(
      answer.results.map((entry) => entry.name),
      ["First7 Last7"],
      "a search that can be answered should answer with its matches"
    );
  });

  test("answers a query that matches nothing with an empty list, distinct from 'not ready'", async () => {
    const service = await freshDirectoryService();
    stubWholeRealm(Array.from({ length: 5 }, (_, index) => namedUser(0, index)));
    await service.startDirectoryRefresh(async () => "token");

    const answer = await service.searchDirectory("nobody-by-that-name");

    assert.equal(answer.ready, true, "an empty match is an answer, not an absence of one");
    assert.deepEqual(answer.results, []);
  });

  test("answers from data past its TTL and starts the refresh behind the answer, not in front of it", async () => {
    const service = await freshDirectoryService();
    stubWholeRealm(Array.from({ length: 5 }, (_, index) => namedUser(0, index)));
    await service.startDirectoryRefresh(async () => "token");

    // Past directoryCacheTtlMs (10 minutes) without sitting through it. The TTL
    // says when to *start* refreshing, not when to stop serving - going back to
    // "not ready" every ten minutes is the state this change exists to leave.
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60 * 1000;
    let answer;
    try {
      answer = await service.searchDirectory("");
    } finally {
      Date.now = realNow;
    }

    assert.equal(answer.ready, true, "stale-by-minutes data is still an answer");
    assert.equal(answer.results.length, 5, "the held data should be what it answers from");
    assert.equal(
      service.getDirectoryStatus().fetching,
      true,
      "an expired TTL should have started a refresh behind the answer rather than been awaited"
    );
  });
});
