/**
 * The content suite: what SafeLearn renders, for whom.
 *
 * The checks are filed by concern under `test/checks/`, but they are modules
 * rather than test files. `node --test` gives every `*.test.js` its own process,
 * and one process per concern would mean one server and two logins per concern.
 * Every login is a real round-trip against a public identity provider shared
 * with other people, so this one file imports them all: the whole content suite
 * runs in one process and logs in twice, once per role.
 *
 * The accounts are public and their preferences live on the identity provider.
 * Every check therefore addresses its page by path and writes every preference
 * it depends on before reading, and asserts only against what it just wrote —
 * see docs-testing.md.
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { knownRoles, loginCount, shutdown } from "./harness.js";

import "./checks/permissions.js";
import "./checks/views.js";
import "./checks/rendering.js";
import "./checks/navigation.js";
import "./checks/presentation.js";
// Last on purpose: its reference walk requests every page the navigation tree
// links to, and each of those writes `lastVisitedUrl` back to the shared account
// after the answer has been sent. Nothing that sets a preference may follow it.
import "./checks/deployment-surface.js";

let startedAt = null;

before(() => {
  startedAt = Date.now();
});

/**
 * Runs after every check in this file. A suite that quietly starts logging in
 * per concern, or that doubles in cost, is a regression worth seeing.
 */
test("the content suite logged in once per role and no more", () => {
  assert.equal(
    loginCount(),
    knownRoles.length,
    `the content suite needs one session per role — ${knownRoles.join(", ")} — and performed ` +
      `${loginCount()} logins. Splitting checks into more files must not cost more round-trips ` +
      `against the identity provider.`
  );
});

after(async () => {
  const elapsed = startedAt === null ? 0 : Date.now() - startedAt;
  console.log(
    `\ncontent suite: ${(elapsed / 1000).toFixed(1)} s, ${loginCount()} login(s) against the identity provider.`
  );
  await shutdown();
});
