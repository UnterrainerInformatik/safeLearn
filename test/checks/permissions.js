/**
 * What each session is allowed to see.
 *
 * Reads `md/test-perms.md`, `md/test-fileperms-teachers.md`,
 * `md/test-fileperms-4bhif-5bhif-2ahif.md` and the time-bound blocks of
 * `md/test-md-file.md`.
 *
 * Every expectation is derived from the roles the session actually carries.
 * Which classes the demo accounts belong to is not documented and not ours to
 * rely on, so a check asks the session instead of assuming.
 *
 * This is a module, not a test file: `test/content.test.js` imports it so the
 * whole content suite runs in one process and logs in twice.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { render, roles, setPreferences, sharedSession } from "../harness.js";

const permissionsPage = "/md/test-perms.md";
const timedPage = "/md/test-md-file.md";

/** What the application renders in place of a file the session may not read. */
const refusal = "You do not have the required permissions to view this content.";

/**
 * The `@@@` blocks of `md/test-perms.md`. `text` is the block's content; the
 * sentence that introduces each block stays visible either way and is worded
 * differently, so a match is the block and nothing else.
 */
const blocks = [
  { what: "the teacher block", role: "teacher", text: "Only visible to teachers." },
  { what: "the 5bhif group block", role: "5bhif", text: "Only visible to 5BHIF." },
  { what: "the block addressed to the student by name", role: "stu dent", text: "Only visible to Stu Dent" },
  {
    what: "the second teacher block",
    role: "teacher",
    text: "Only visible to users being in teachers AND 5bhif groups.",
  },
];

/** The files whose first line restricts the whole file. */
const restrictedFiles = [
  {
    path: "/md/test-fileperms-teachers.md",
    directive: ["teacher"],
    content: "Only visible to teachers",
  },
  {
    path: "/md/test-fileperms-4bhif-5bhif-2ahif.md",
    directive: ["4bhif", "5bhif", "4ahif"],
    content: "Special visibility",
  },
];

/** The time-bound blocks of `md/test-md-file.md`, with the window each carries. */
const timedBlocks = [
  {
    what: "the block whose 2099 windows have not opened, granted to 4ahif and examParticipant without one",
    text: "This block demonstrates time-bound permissions.",
    // Only the entries without a window can grant this block today.
    unwindowed: ["4ahif", "examparticipant"],
  },
  {
    what: "the teacher block whose window opened in 2025",
    text: "Time-Conditional FROM",
    unwindowed: [],
    open: ["teacher"],
  },
  {
    what: "the teacher block whose 2025 window has closed",
    text: "Time-Conditional FROM-TO",
    unwindowed: [],
    open: [],
  },
];

describe("permissions", () => {
  const carried = new Map();
  const shown = new Map();

  /** The navigation tree of the page the session is looking at. */
  const treeEntries = (session) =>
    session.page.evaluate(() =>
      [...document.querySelectorAll(".sidebar-dirlist a")].map((entry) =>
        decodeURIComponent(entry.getAttribute("href"))
      )
    );

  before(async () => {
    for (const role of ["student", "teacher"]) {
      const session = await sharedSession(role);
      carried.set(role, await roles(session));
      // Everything below depends on the teacher view being on and on the start
      // page not resolving to the account's last visited URL.
      await setPreferences(session, {});
      shown.set(role, {
        session,
        perms: (await render(session, permissionsPage)).text,
        timed: (await render(session, timedPage)).text,
      });
    }
  });

  // ---- 3.1 Block-level directives, both directions per block ----

  for (const block of blocks) {
    test(`${block.what} of ${permissionsPage} appears exactly for the sessions holding "${block.role}"`, () => {
      for (const role of ["student", "teacher"]) {
        const allowed = carried.get(role).has(block.role) || carried.get(role).has("admin");
        const text = shown.get(role).perms;
        assert.equal(
          text.includes(block.text),
          allowed,
          allowed
            ? `the ${role} session holds "${block.role}" and should see ${block.what} of ${permissionsPage}`
            : `the ${role} session does not hold "${block.role}" and should not see ${block.what} of ${permissionsPage} anywhere in the page`
        );
      }
    });
  }

  test(`the two sessions really do differ on ${permissionsPage}`, () => {
    // Without this, a page that hid everything from everyone would satisfy every
    // "should not see" above.
    assert.notEqual(
      shown.get("student").perms,
      shown.get("teacher").perms,
      `${permissionsPage} should not render identically for both sessions`
    );
  });

  // ---- 3.2 Whole-file directives by direct path ----

  for (const file of restrictedFiles) {
    test(`${file.path} is served by direct path exactly to the sessions its first line names`, async () => {
      for (const role of ["student", "teacher"]) {
        const session = shown.get(role).session;
        const allowed =
          file.directive.some((role_) => carried.get(role).has(role_)) ||
          carried.get(role).has("admin");
        const { text } = await render(session, file.path);
        assert.equal(
          text.includes(file.content),
          allowed,
          `the ${role} session ${allowed ? "holds" : "holds none of"} ${file.directive.join(", ")} ` +
            `and should ${allowed ? "" : "not "}see the content of ${file.path}`
        );
        assert.equal(
          text.includes(refusal),
          !allowed,
          `the ${role} session should ${allowed ? "not " : ""}be refused ${file.path}`
        );
      }
    });
  }

  // ---- 3.3 Whole-file directives in the navigation tree ----

  for (const file of restrictedFiles) {
    test(`${file.path} is listed in the navigation tree exactly for the sessions its first line names`, async () => {
      for (const role of ["student", "teacher"]) {
        const session = shown.get(role).session;
        const allowed =
          file.directive.some((role_) => carried.get(role).has(role_)) ||
          carried.get(role).has("admin");
        await render(session, timedPage);
        const listed = (await treeEntries(session)).some((entry) => entry === file.path);
        assert.equal(
          listed,
          allowed,
          `${file.path} should ${allowed ? "" : "not "}be in the navigation tree of the ${role} session`
        );
      }
    });
  }

  // ---- 3.4 Time-bounded visibility ----

  for (const block of timedBlocks) {
    test(`${block.what} on ${timedPage} follows its window`, () => {
      for (const role of ["student", "teacher"]) {
        const held = carried.get(role);
        const granted =
          [...(block.unwindowed ?? []), ...(block.open ?? [])].some((role_) => held.has(role_)) ||
          held.has("admin");
        assert.equal(
          shown.get(role).timed.includes(block.text),
          granted,
          granted
            ? `the ${role} session holds a role this directive grants without a closed window, so it should see ${block.what}`
            : `no role the ${role} session holds grants ${block.what} right now, so it should be absent`
        );
      }
    });
  }

  // ---- 3.5 The teacher viewing as a student ----

  test("a teacher who drops the teacher view sees what a student sees, and gets it back", async () => {
    const teacher = shown.get("teacher").session;
    assert.ok(
      carried.get("teacher").has("teacher"),
      "this check needs a session that actually holds the teacher role"
    );
    const teacherFile = restrictedFiles[0];

    try {
      await setPreferences(teacher, { vt: 0 });
      const downgraded = await render(teacher, permissionsPage);
      assert.ok(
        !downgraded.text.includes(blocks[0].text),
        "with the teacher view dropped, the teacher-only block should be gone from the page"
      );
      assert.ok(
        !(await treeEntries(teacher)).includes(teacherFile.path),
        `with the teacher view dropped, ${teacherFile.path} should be gone from the navigation tree`
      );
      const denied = await render(teacher, teacherFile.path);
      assert.ok(
        denied.text.includes(refusal),
        `with the teacher view dropped, ${teacherFile.path} should be refused by direct path too`
      );
    } finally {
      await setPreferences(teacher, { vt: 1 });
    }

    const restored = await render(teacher, permissionsPage);
    assert.ok(
      restored.text.includes(blocks[0].text),
      "with the teacher view back on, the teacher-only block should be visible again"
    );
    assert.ok(
      (await treeEntries(teacher)).includes(teacherFile.path),
      `with the teacher view back on, ${teacherFile.path} should be in the navigation tree again`
    );
  });

  // ---- 3.6 The harness against the application ----

  test("the roles the harness derives agree with what the application shows", () => {
    for (const role of ["student", "teacher"]) {
      assert.equal(
        carried.get(role).has("teacher"),
        shown.get(role).perms.includes(blocks[0].text),
        `the harness says the ${role} session ${carried.get(role).has("teacher") ? "holds" : "does not hold"} ` +
          `"teacher", but ${permissionsPage} shows the opposite. One of the two is wrong.`
      );
    }
  });
});
