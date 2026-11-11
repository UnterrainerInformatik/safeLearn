/**
 * The content suite: what SafeLearn renders, for whom.
 *
 * The checks are filed by concern under `test/checks/`, but they are modules
 * rather than test files. `node --test` gives every `*.test.js` its own process,
 * and one process per concern would mean one server and two logins per concern.
 * Every login is a real round-trip against a public identity provider shared
 * with other people, so this one file imports them all: the whole content suite
 * runs in one process and logs in once per role - plus the one session
 * `session-lifecycle.js` ends at the identity provider, which no other check
 * can share.
 *
 * The accounts are public and their preferences live on the identity provider.
 * Every check therefore addresses its page by path and writes every preference
 * it depends on before reading, and asserts only against what it just wrote —
 * see docs-testing.md.
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { knownRoles, loginCount, sharedRoles, shutdown } from "./harness.js";

/**
 * Logins beyond one per role, each named. `session-lifecycle.js` signs its
 * session out at Keycloak, so that session cannot be one every later check
 * shares.
 */
const ownSessions = ["session-lifecycle"];

/**
 * Every check module, in the order the suite runs them. `deployment-surface`
 * is last on purpose: its reference walk requests every page the navigation
 * tree links to, and each of those writes `lastVisitedUrl` back to the shared
 * account after the answer has been sent. Nothing that sets a preference may
 * follow it.
 */
const modules = [
  "permissions",
  "views",
  "rendering",
  "legibility",
  "navigation",
  "presentation",
  "search",
  "search-keyboard",
  "directory-search",
  "admin-pages",
  "session-lifecycle",
  "attachments",
  "pdf-embeds",
  "exam-embedding",
  "frontmatter",
  "deployment-surface",
];

/**
 * `SAFELEARN_TEST_CHECKS` names a comma-separated selection of modules
 * (`rendering,views`), which `npm run test:changed` sets. Unset, every module
 * runs. A selection still runs in the order above.
 */
const requested = (process.env.SAFELEARN_TEST_CHECKS ?? "")
  .split(",")
  .map((name) => name.trim().replace(/\.js$/, ""))
  .filter(Boolean);
const unknown = requested.filter((name) => !modules.includes(name));
if (unknown.length > 0) {
  throw new Error(
    `SAFELEARN_TEST_CHECKS names ${unknown.join(", ")}, which ${unknown.length > 1 ? "are" : "is"} not a content module. ` +
      `Known modules: ${modules.join(", ")}.`
  );
}
const selection = requested.length > 0 ? modules.filter((name) => requested.includes(name)) : null;

for (const name of selection ?? modules) {
  await import(`./checks/${name}.js`);
}

let startedAt = null;

before(() => {
  startedAt = Date.now();
});

/**
 * Runs after every check in this file. A suite that quietly starts logging in
 * per concern, or that doubles in cost, is a regression worth seeing. A
 * selection is held to the same rule for the roles it actually used.
 */
test("the content suite logged in once per role and no more", () => {
  if (selection === null) {
    assert.equal(
      loginCount(),
      knownRoles.length + ownSessions.length,
      `the content suite needs one session per role — ${knownRoles.join(", ")} — plus one for each of ` +
        `${ownSessions.join(", ")}, and performed ` +
        `${loginCount()} logins. Splitting checks into more files must not cost more round-trips ` +
        `against the identity provider.`
    );
    return;
  }
  const own = ownSessions.filter((name) => selection.includes(name));
  const used = sharedRoles();
  assert.ok(used.length <= knownRoles.length, `shared sessions were opened for unknown roles: ${used.join(", ")}`);
  assert.equal(
    loginCount(),
    used.length + own.length,
    `the selected modules (${selection.join(", ")}) used the role(s) ${used.join(", ") || "none"}` +
      `${own.length > 0 ? ` plus a session of their own for ${own.join(", ")}` : ""}, and performed ` +
      `${loginCount()} logins. A selection logs in at most once per role it uses.`
  );
});

after(async () => {
  const elapsed = startedAt === null ? 0 : Date.now() - startedAt;
  console.log(
    `\ncontent suite${selection === null ? "" : ` (${selection.join(", ")})`}: ${(elapsed / 1000).toFixed(1)} s, ` +
      `${loginCount()} login(s) against the identity provider.`
  );
  await shutdown();
});
