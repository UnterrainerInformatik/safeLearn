/**
 * The permission context: one lookup, one role set, one clock per request.
 *
 * `hasSomeRoles` used to rebuild everything it needed on every call, including
 * an uncached fetch against the identity provider's account endpoint. One page
 * view of the production corpus asked it about a hundred and forty times. What
 * this file guards is that the question is now resolved once and that every
 * check of a request is answered from that one resolution - the property the
 * change buys, and one nothing else in the suite would notice losing.
 *
 * Unit-level, not a live-Keycloak check, in the shape of
 * `test/directory-service.test.js`: `fetch` is stubbed here rather than calling
 * the shared demo realm, because what is being counted is how often the
 * application asks, which a real realm cannot be made to report.
 * `test/checks/permissions.js` covers the same property against the real thing.
 *
 * `getClientRoles` reads the `keycloak.json` the middleware parses in
 * `initKeycloak`, which never runs here, so the sessions below carry their roles
 * the other two ways a session can: the LDAP groups in `rolesCalculated` and the
 * display name.
 */

import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";

import { getPermissionContext } from "../permission-context.js";
import { setUserAttribute } from "../middlewares/keycloak-middleware.js";
import { hasSomeRoles, identityOf } from "../utils.js";
import { resolveFileVisibility } from "../obsidian.js";

const originalFetch = global.fetch;
const originalConsoleError = console.error;

/** How often the stub was asked for the account since it was installed. */
let lookups = 0;

afterEach(() => {
  global.fetch = originalFetch;
  console.error = originalConsoleError;
  mock.timers.reset();
});

/** A session as passport leaves it on `req`, carrying `groups` as LDAP roles. */
function session(groups = {}, name = "Stu Dent") {
  return {
    user: {
      name,
      preferred_username: "sdent",
      accessToken: "access-token",
      accessTokenDecoded: {},
      keycloakConfig: {
        "auth-server-url": "https://identity.example/",
        realm: "demo",
        resource: "safelearn",
      },
      rolesCalculated: JSON.stringify(groups),
    },
  };
}

const teacherSession = () => session({ teacher: true }, "Tea Cher");

/** What the account endpoint answers with: every attribute inside an array. */
function accountBody(preferences) {
  return {
    id: "0000-1111",
    username: "sdent",
    emailVerified: true,
    userProfileMetadata: { attributes: [] },
    attributes: {
      config: [JSON.stringify(preferences)],
      lastVisitedUrl: ["/md/test-md-file.md"],
    },
  };
}

/**
 * Answers the account endpoint with `preferences`, counting the calls. `gate`,
 * when given, is awaited before answering, so a check can start while the
 * lookup is still in flight.
 */
function stubAccount(preferences, gate = null) {
  lookups = 0;
  global.fetch = async () => {
    lookups += 1;
    if (gate) await gate;
    return { ok: true, json: async () => accountBody(preferences) };
  };
}

/** Answers every account request with a failure. */
function stubFailingAccount(status = 503) {
  lookups = 0;
  global.fetch = async () => {
    lookups += 1;
    return { ok: false, status, text: async () => "Service Unavailable" };
  };
}

/** Collects what the application logged while `load` ran. */
async function whileLogging(load) {
  const logged = [];
  console.error = (...args) => logged.push(args.map(String).join(" "));
  try {
    await load();
  } finally {
    console.error = originalConsoleError;
  }
  return logged;
}

describe("how often a request asks the identity provider", () => {
  test("answers many checks of one request from one lookup", async () => {
    stubAccount({ vt: 1, ve: 0, va: 0 });
    const req = teacherSession();

    for (let i = 0; i < 25; i++) {
      await hasSomeRoles(req, ["teacher"], true);
    }

    assert.equal(
      lookups,
      1,
      "every check of one request must be answered from the context the first one built"
    );
  });

  test("asks nothing for a request that evaluates no directive", async () => {
    stubAccount({ vt: 1 });
    const req = teacherSession();

    assert.equal(await hasSomeRoles(req, []), true, "a directive naming no role grants everyone");
    assert.equal(await hasSomeRoles(req, ["   "]), true);

    assert.equal(lookups, 0, "a request that asks no permission question must cost no lookup");
    assert.ok(!req.permissionContext, "and must not have built a context either");
  });

  test("answers checks started before the first one resolves from the same lookup", async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    stubAccount({ vt: 1 }, gate);
    const req = teacherSession();

    // The fan-out in `removeForbiddenContent`: every block of a document starts
    // its check before any of them has finished.
    const checks = Promise.all(
      Array.from({ length: 12 }, () => hasSomeRoles(req, ["teacher"], true))
    );
    release();
    const answers = await checks;

    assert.deepEqual(answers, Array.from({ length: 12 }, () => true));
    assert.equal(
      lookups,
      1,
      "a context that is only stored once it resolves would leave every concurrent check building one of its own"
    );
  });
});

describe("the role set a request is judged by", () => {
  test("a downgraded check leaves the following check unchanged, in either order", async () => {
    // The student view: a teacher looking at the corpus the way a student sees
    // it. The downgrade applies to the check that asks for it and to no other.
    stubAccount({ vt: 0 });

    const downgradedFirst = teacherSession();
    assert.equal(
      await hasSomeRoles(downgradedFirst, ["teacher"], true),
      false,
      "with the teacher view off, a check that allows the override is decided as a student"
    );
    assert.equal(
      await hasSomeRoles(downgradedFirst, ["teacher"]),
      true,
      "a check that does not allow the override must still see the session's real roles"
    );

    const downgradedSecond = teacherSession();
    assert.equal(await hasSomeRoles(downgradedSecond, ["teacher"]), true);
    assert.equal(
      await hasSomeRoles(downgradedSecond, ["teacher"], true),
      false,
      "and the order the two are asked in must not change either answer"
    );

    const context = await getPermissionContext(downgradedFirst);
    assert.ok(
      context.full.roles.has("teacher") && context.full.roles.has("teachers"),
      "the downgrade selects the student-view set; it must never delete from the shared one"
    );
    assert.ok(!context.studentView.roles.has("teacher"));
    assert.ok(!context.studentView.roles.has("teachers"));
    assert.ok(!context.studentView.roles.has("admin"));
  });

  test("grants no session a role inherited from Object.prototype", async () => {
    stubAccount({ vt: 1 });
    const req = teacherSession();

    for (const inherited of ["constructor", "__proto__", "toString", "valueOf"]) {
      assert.equal(
        await hasSomeRoles(req, [inherited], true),
        false,
        `@@@ ${inherited} must address nobody - on a plain object it addressed everybody`
      );
      assert.equal(await hasSomeRoles(req, [inherited]), false);
    }
  });
});

describe("a lookup that fails", () => {
  test("settles the whole request on the default preferences, with its roles intact", async () => {
    stubFailingAccount();
    const req = teacherSession();

    const logged = await whileLogging(async () => {
      const context = await getPermissionContext(req);

      assert.equal(context.lookupFailed, true);
      assert.deepEqual(
        context.preferences,
        { ve: 0, vt: 0, va: 0, lang: "en", loc: "de-AT" },
        "the defaults are the narrowest values the preferences can take, so a failure only takes content away"
      );

      // The roles never came from the lookup: they are in the session and in the
      // access token, so a failed lookup cannot change who the session is.
      assert.equal(await hasSomeRoles(req, ["teacher"]), true);
      assert.equal(
        await hasSomeRoles(req, ["teacher"], true),
        false,
        "the teacher view reads as off, so a check allowing the override is decided as a student"
      );
      assert.equal(await hasSomeRoles(req, ["#answer"]), false, "answers stay hidden");
      assert.equal(await hasSomeRoles(req, ["#practice"]), true, "and the practice variant is shown");

      // Every check of this request sees what the first one settled on.
      for (let i = 0; i < 10; i++) {
        assert.equal(await hasSomeRoles(req, ["teacher"], true), false);
      }
    });

    assert.equal(lookups, 1, "a failed lookup must not be retried once per check");
    const failures = logged.filter((line) => line.includes("Error fetching current attributes"));
    assert.equal(
      failures.length,
      1,
      `the failure belongs in the log once for the request, not once per directive; logged: ${logged.length}`
    );
  });

  test("carries nothing into the next request", async () => {
    stubFailingAccount();
    const failing = teacherSession();
    await whileLogging(() => hasSomeRoles(failing, ["teacher"], true));

    stubAccount({ vt: 1 });
    const succeeding = teacherSession();
    assert.equal(
      await hasSomeRoles(succeeding, ["teacher"], true),
      true,
      "a request that can read the preferences is decided against the stored ones"
    );
  });
});

describe("the reference time a request compares windows against", () => {
  /** A whole-file directive open to teachers until `end`. */
  const openUntil = (end) => [{ role: "teacher", window: { start: null, end } }];

  test("is fixed for the request, even across the moment a window closes", async () => {
    const startedAt = Date.UTC(2030, 0, 1, 12, 0, 0);
    mock.timers.enable({ apis: ["Date"], now: startedAt });
    stubAccount({ vt: 1 });

    const closesAt = startedAt + 5 * 60 * 1000;
    const req = teacherSession();

    const first = await resolveFileVisibility(req, openUntil(closesAt));
    assert.equal(first.visible, true, "the window is open when the request starts");

    // The page is still being assembled when the window closes.
    mock.timers.setTime(startedAt + 10 * 60 * 1000);

    const last = await resolveFileVisibility(req, openUntil(closesAt));
    assert.equal(
      last.visible,
      true,
      "the last directive of a page must be decided against the time its first one was"
    );

    // A control, so the check cannot pass because the window never closed: the
    // next request reads the clock again and finds it shut.
    const next = await resolveFileVisibility(teacherSession(), openUntil(closesAt));
    assert.equal(next.visible, false);
    assert.equal(next.reason, "outside-window");
  });
});

describe("the identity a request is recorded under", () => {
  test("is the username, trimmed and lowercased, never the Keycloak id", () => {
    const req = { user: { sub: "0000-1111", accessTokenDecoded: { preferred_username: " SDent " } } };
    assert.equal(identityOf(req), "sdent");
  });

  test("falls back to the session user's own username", () => {
    assert.equal(identityOf({ user: { preferred_username: "TCher" } }), "tcher");
  });

  test("is null without a session or without a username", () => {
    assert.equal(identityOf({}), null);
    assert.equal(identityOf(undefined), null);
    assert.equal(identityOf({ user: { accessTokenDecoded: {} } }), null);
    assert.equal(identityOf({ user: { accessTokenDecoded: { preferred_username: "   " } } }), null);
    assert.equal(identityOf({ user: { accessTokenDecoded: { preferred_username: 42 } } }), null);
  });
});

describe("two writes of one account do not undo each other", () => {
  /**
   * An account endpoint that keeps one account the way Keycloak does: a POST
   * replaces the whole attribute set. A POST whose `lastVisitedUrl` is
   * `held` waits for `release` before it is stored, as a slow write would.
   */
  function accountStore(attributes, { held = null, release = null } = {}) {
    const store = { attributes: { ...attributes }, posts: 0 };
    global.fetch = async (url, options = {}) => {
      if (options.method === "POST") {
        const body = JSON.parse(options.body);
        if (held !== null && body.attributes.lastVisitedUrl === held) await release;
        store.posts += 1;
        store.attributes = { ...body.attributes };
        return { ok: true };
      }
      return { ok: true, json: async () => ({ id: "0000-1111", username: "x", attributes: Object.fromEntries(Object.entries(store.attributes).map(([k, v]) => [k, [v]])) }) };
    };
    return store;
  }

  /** A session of its own per check, so the writes of one check never queue behind another's. */
  const sessionOf = (name) => {
    const req = teacherSession();
    req.user.preferred_username = name;
    return req;
  };

  test("a page read with the old preferences, writing lastVisitedUrl after a newer config was stored, keeps the newer config", async () => {
    const store = accountStore({ config: JSON.stringify({ vt: 0 }), lastVisitedUrl: "/before" });
    const page = sessionOf("writer-late");
    // The page reads the account while the teacher is still in student view.
    assert.equal((await getPermissionContext(page)).preferences.vt, 0);
    // The teacher switches back; that write is stored first.
    assert.equal(await setUserAttribute(sessionOf("writer-late"), "config", JSON.stringify({ vt: 1 })), true);
    assert.equal(JSON.parse(store.attributes.config).vt, 1);
    // Only now does the page store where it was.
    assert.equal(await setUserAttribute(page, "lastVisitedUrl", "/page"), true);
    assert.deepEqual(
      { config: JSON.parse(store.attributes.config), lastVisitedUrl: store.attributes.lastVisitedUrl },
      { config: { vt: 1 }, lastVisitedUrl: "/page" },
      "the page's write carries the newer config, not the one it read"
    );
  });

  test("a slow lastVisitedUrl write and a config write started after it end with the new config, in the order asked", async () => {
    let open;
    const release = new Promise((resolve) => (open = resolve));
    const store = accountStore({ config: JSON.stringify({ vt: 0 }), lastVisitedUrl: "/before" }, { held: "/page", release });
    const page = sessionOf("writer-slow");
    await getPermissionContext(page);
    const visited = setUserAttribute(page, "lastVisitedUrl", "/page");
    const reset = setUserAttribute(sessionOf("writer-slow"), "config", JSON.stringify({ vt: 1 }));
    // Give the reset every chance to overtake the held write.
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(store.posts, 0, "the config write waits for the one asked for before it");
    open();
    assert.deepEqual([await visited, await reset], [true, true]);
    assert.equal(store.posts, 2);
    assert.deepEqual(
      { config: JSON.parse(store.attributes.config), lastVisitedUrl: store.attributes.lastVisitedUrl },
      { config: { vt: 1 }, lastVisitedUrl: "/page" },
      "the new config stands, and the page's lastVisitedUrl is kept"
    );
  });

  test("a failed write does not hold up the next one, and is not laid over it", async () => {
    const store = accountStore({ config: JSON.stringify({ vt: 0 }) });
    const req = sessionOf("writer-failing");
    const working = global.fetch;
    global.fetch = async (url, options = {}) => (options.method === "POST" ? { ok: false, status: 500 } : working(url, options));
    const logged = await whileLogging(async () => {
      assert.equal(await setUserAttribute(req, "config", JSON.stringify({ vt: 1 })), false);
    });
    assert.ok(logged.length > 0, "the failure is logged");
    global.fetch = working;
    assert.equal(await setUserAttribute(sessionOf("writer-failing"), "lastVisitedUrl", "/page"), true);
    assert.equal(JSON.parse(store.attributes.config).vt, 0, "the refused config is not written along");
  });
});
