/**
 * What each session is allowed to see.
 *
 * Reads `md/test-perms.md`, `md/test-perms-teacher-alias.md`,
 * `md/test-perms-student-alias.md`, `md/test-fileperms-teachers.md`,
 * `md/test-fileperms-4bhif-5bhif-2ahif.md`,
 * `md/test-fileperms-window-closed.md` and the admin and time-bound blocks of
 * `md/test-md-file.md`.
 *
 * It also compares the navigation tree against the page each entry leads to.
 * The tree is built from the scan-time index and the page is rendered from the
 * file on disk; both reach `resolveFileVisibility`, and the point of that
 * function is that they cannot drift apart. The check reads the tree from the
 * rendered sidebar rather than calling back into the application, so it is a
 * second opinion and not an echo.
 *
 * Every expectation is derived from the roles the session actually carries.
 * Which classes the demo accounts belong to is not documented and not ours to
 * rely on, so a check asks the session instead of assuming.
 *
 * This is a module, not a test file: `test/content.test.js` imports it so the
 * whole content suite runs in one process and logs in twice.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { before, describe, test } from "node:test";

import { render, roles, setPreferences, sharedSession } from "../harness.js";

const corpusRoot = path.join(path.resolve(import.meta.dirname, "..", ".."), "md");

/** Every Markdown file of the corpus, as the path the application serves it on. */
function corpusPaths(directory = corpusRoot, collected = []) {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) corpusPaths(full, collected);
    else if (path.extname(entry) === ".md") {
      collected.push("/md/" + path.relative(corpusRoot, full).split(path.sep).join("/"));
    }
  }
  return collected;
}

/** Whether a corpus file's first line is a whole-file `@@@` directive. */
const carriesWholeFileDirective = (servedPath) =>
  /^\s*@@@\s*\S/.test(
    readFileSync(path.join(corpusRoot, servedPath.slice("/md/".length)), "utf8").split("\n")[0]
  );

const permissionsPage = "/md/test-perms.md";
const timedPage = "/md/test-md-file.md";
const aliasPage = "/md/test-perms-teacher-alias.md";
const studentAliasPage = "/md/test-perms-student-alias.md";

/** Every page the checks below read, rendered once per session. */
const pages = [permissionsPage, timedPage, aliasPage, studentAliasPage];

/** What the application renders in place of a file the session may not read. */
const refusal = "You do not have the required permissions to view this content.";

/**
 * The other refusal: a whole-file directive whose time windows leave no role
 * active at all hides the file from everyone, including the roles it names.
 * `resolveFileVisibility` in `obsidian.js` reports the two causes apart, and
 * `sanitizeAndParseMarkdown` in `app.js` turns them into these two strings.
 */
const closedWindowRefusal = "This content is not visible right now.";

/** The teacher-only block of `md/test-perms.md`, named because 3.5 and 3.6 use it. */
const teacherBlock = {
  what: "the teacher block",
  page: permissionsPage,
  role: "teacher",
  text: "Only visible to teachers.",
};

/**
 * The block of `md/test-perms-teacher-alias.md` addressed in the plural. The
 * alias is a property of the session's role set, not of the directive, so the
 * role a session has to carry for it is `teacher`.
 */
const aliasBlock = {
  what: "the plural alias block",
  page: aliasPage,
  role: "teachers",
  granted: "teacher",
  text: "Reached through the plural alias.",
};

/**
 * The block of the same file that names the role and its alias together.
 * Naming both must grant exactly what naming either one alone grants.
 */
const aliasPairBlock = {
  what: "the block naming the role and its alias at once",
  page: aliasPage,
  role: "teacher, teachers",
  granted: "teacher",
  text: "Reached through the role and the alias at once.",
};

/**
 * The blocks of `md/test-perms-student-alias.md`. `student` and `students`
 * address exactly the same readers, in either direction, so all three blocks
 * are granted by the one role a session can actually carry: `student`.
 */
const studentAliasBlocks = [
  {
    what: "the block addressed with the plural spelling",
    role: "students",
    text: "Reached through the plural student alias.",
  },
  {
    what: "the block addressed with the singular spelling",
    role: "student",
    text: "Reached through the singular student role.",
  },
  {
    what: "the block naming the student role and its alias at once",
    role: "student, students",
    text: "Reached through the student role and its alias at once.",
  },
];

/**
 * The `@@@` blocks addressed by role. `text` is the block's content; the
 * sentence that introduces each block stays visible either way and is worded
 * differently, so a match is the block and nothing else. `granted` names the
 * role a session must carry when that is not the role the directive writes.
 */
const blocks = [
  teacherBlock,
  { what: "the 5bhif group block", page: permissionsPage, role: "5bhif", text: "Only visible to 5BHIF." },
  {
    what: "the block addressed to the student by name",
    page: permissionsPage,
    role: "stu dent",
    text: "Only visible to Stu Dent",
  },
  {
    what: "the second teacher block",
    page: permissionsPage,
    role: "teacher",
    text: "Only visible to users being in teachers AND 5bhif groups.",
  },
  { what: "the admin block", page: timedPage, role: "admin", text: "Admins only!!!" },
  aliasBlock,
  aliasPairBlock,
];

/**
 * The files whose first line restricts the whole file. `directive` is the role
 * list the line names; `windowClosed` marks a directive whose windows have all
 * closed, which leaves no role active and so hides the file from everyone.
 */
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
  {
    path: "/md/test-fileperms-window-closed.md",
    directive: ["teacher"],
    windowClosed: true,
    content: "Only visible while the window is open.",
  },
];

/**
 * Whether the session of `role` may see `file`, derived from the roles it
 * actually carries. A closed window is decided before any role is tested, so it
 * hides the file from the role it names and from `admin` alike - which is why
 * this is not just a membership test.
 */
const maySeeFile = (carried, file) =>
  !file.windowClosed &&
  (file.directive.some((named) => carried.has(named)) || carried.has("admin"));

/** The message a session is given in place of `file`, when it is refused one. */
const refusalFor = (file) => (file.windowClosed ? closedWindowRefusal : refusal);

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
      const text = new Map();
      for (const page of pages) text.set(page, (await render(session, page)).text);
      shown.set(role, { session, text });
    }
  });

  /** What `page` rendered to for the session of `role`. */
  const rendered = (role, page) => shown.get(role).text.get(page);

  // ---- 3.1 Block-level directives, both directions per block ----

  for (const block of blocks) {
    const held = block.granted ?? block.role;
    test(`${block.what} of ${block.page} appears exactly for the sessions holding "${held}"`, () => {
      for (const role of ["student", "teacher"]) {
        const allowed = carried.get(role).has(held) || carried.get(role).has("admin");
        const text = rendered(role, block.page);
        assert.equal(
          text.includes(block.text),
          allowed,
          allowed
            ? `the ${role} session holds "${held}" and should see ${block.what} of ${block.page}`
            : `the ${role} session does not hold "${held}" and should not see ${block.what} of ${block.page} anywhere in the page`
        );
      }
    });
  }

  // ---- 3.1a Both spellings of the student role ----

  test(`both spellings of the student role address exactly the sessions holding "student" on ${studentAliasPage}`, () => {
    const exercised = [];
    for (const role of ["student", "teacher"]) {
      const holds = carried.get(role).has("student");
      const allowed = holds || carried.get(role).has("admin");
      exercised.push(`the ${role} session ${holds ? "holds" : "does not hold"} it`);
      for (const block of studentAliasBlocks) {
        assert.equal(
          rendered(role, studentAliasPage).includes(block.text),
          allowed,
          allowed
            ? `the ${role} session holds "student" and should see ${block.what}, addressed "${block.role}"`
            : `the ${role} session does not hold "student" and should not see ${block.what}, ` +
              `addressed "${block.role}", anywhere in ${studentAliasPage}`
        );
      }
    }
    // Which direction a live login exercises depends on the demo accounts, and
    // whether they carry `student` is nothing this repository owns. The run
    // says it out loud, so an account that stops carrying the role shows up
    // here instead of quietly reducing this check to its negative half.
    console.log(`      the student alias, exercised against: ${exercised.join(", ")}`);
  });

  test(`the two sessions really do differ on ${permissionsPage}`, () => {
    // Without this, a page that hid everything from everyone would satisfy every
    // "should not see" above.
    assert.notEqual(
      rendered("student", permissionsPage),
      rendered("teacher", permissionsPage),
      `${permissionsPage} should not render identically for both sessions`
    );
  });

  // ---- 3.2 Whole-file directives by direct path ----

  for (const file of restrictedFiles) {
    test(`${file.path} is served by direct path exactly to the sessions its first line names`, async () => {
      for (const role of ["student", "teacher"]) {
        const session = shown.get(role).session;
        const allowed = maySeeFile(carried.get(role), file);
        const { text } = await render(session, file.path);
        assert.equal(
          text.includes(file.content),
          allowed,
          file.windowClosed
            ? `the window on ${file.path} has closed, so the ${role} session should not see its content`
            : `the ${role} session ${allowed ? "holds" : "holds none of"} ${file.directive.join(", ")} ` +
              `and should ${allowed ? "" : "not "}see the content of ${file.path}`
        );
        assert.equal(
          text.includes(refusalFor(file)),
          !allowed,
          `the ${role} session should ${allowed ? "not " : ""}be refused ${file.path}` +
            (allowed ? "" : ` with "${refusalFor(file)}"`)
        );
      }
    });
  }

  // ---- 3.3 Whole-file directives in the navigation tree ----

  for (const file of restrictedFiles) {
    test(`${file.path} is listed in the navigation tree exactly for the sessions its first line names`, async () => {
      for (const role of ["student", "teacher"]) {
        const session = shown.get(role).session;
        const allowed = maySeeFile(carried.get(role), file);
        await render(session, timedPage);
        const listed = (await treeEntries(session)).some((entry) => entry === file.path);
        assert.equal(
          listed,
          allowed,
          `${file.path} should ${allowed ? "" : "not "}be in the navigation tree of the ${role} session` +
            (file.windowClosed ? ": its window has closed, so it is listed for nobody" : "")
        );
      }
    });
  }

  // ---- 3.3a The tree and the page decide the same way ----

  // The agreement below walks `restrictedFiles`, which is written out by hand.
  // A corpus file that gained a whole-file directive without being added to it
  // would be skipped silently, and the check would still pass - so the list is
  // held against the corpus itself rather than trusted.
  test("restrictedFiles names every corpus file whose first line is a whole-file directive", () => {
    const inCorpus = corpusPaths().filter(carriesWholeFileDirective).sort();
    const named = restrictedFiles.map((file) => file.path).sort();
    assert.deepEqual(
      named,
      inCorpus,
      "the corpus and this file disagree about which files carry a whole-file directive; " +
        "add the new ones to restrictedFiles, or the checks below will pass over them"
    );
  });

  // The two checks above each compare one side against an expectation this file
  // derives from the session's roles. This one compares the two sides against
  // *each other*, which is the thing `resolveFileVisibility` exists to
  // guarantee: the navigation tree is built from the scan-time index and the
  // page is rendered from the file on disk, and a rule that reached only one of
  // them would show a session a link that refuses to open, or hide a file it is
  // allowed to read. Nothing here says which answer is right - only that there
  // is one answer.
  test("every file with a whole-file directive is listed exactly when it can be opened", async () => {
    const observed = [];
    for (const role of ["student", "teacher"]) {
      const session = shown.get(role).session;
      // Any page will do: the tree is the same on all of them. Reading it from
      // the rendered sidebar, rather than from the application's own functions,
      // is what makes this an independent second opinion.
      await render(session, timedPage);
      const listed = new Set(await treeEntries(session));

      for (const file of restrictedFiles) {
        const inTree = listed.has(file.path);
        const { text } = await render(session, file.path);
        const opens = text.includes(file.content);
        const refused = text.includes(refusal) || text.includes(closedWindowRefusal);

        // A page that neither shows the content nor refuses is a third outcome
        // the agreement below would silently read as "refused".
        assert.ok(
          opens !== refused,
          `${file.path} rendered for the ${role} session as neither its content nor a refusal, ` +
            `so there is nothing to compare the navigation tree against`
        );
        assert.equal(
          inTree,
          opens,
          inTree
            ? `${file.path} is in the navigation tree of the ${role} session but refuses to open. ` +
              `The tree answers from the scan-time index and the page reads the file; they must agree.`
            : `${file.path} opens for the ${role} session but is missing from its navigation tree. ` +
              `The tree answers from the scan-time index and the page reads the file; they must agree.`
        );
        observed.push({ role, path: file.path, inTree });
      }
      // Restore the page the tree was read from, so a later check that assumes
      // the session is still on it is not surprised.
      await render(session, timedPage);
    }

    // Both directions have to occur somewhere in the matrix above. Without this,
    // a tree that listed nothing and a page that refused everything would agree
    // perfectly and pass - and so would the opposite. Which session lands on
    // which side depends on the demo accounts, so the run says what it saw.
    assert.ok(
      observed.some((o) => o.inTree),
      "no session was listed any restricted file, so the agreement above was never tested in the positive direction"
    );
    assert.ok(
      observed.some((o) => !o.inTree),
      "every session was listed every restricted file, so the agreement above was never tested in the negative direction"
    );
    console.log(
      `      tree and page agreed on: ${observed
        .map((o) => `${o.role} ${o.inTree ? "sees" : "does not see"} ${o.path}`)
        .join(", ")}`
    );
  });

  // ---- 3.3b The two refusals, told apart by their cause ----

  // The two refusals must not become interchangeable: a session told "not
  // visible right now" about a file it simply lacks the role for is being told
  // to come back later for something that will never open, and the opposite
  // sends a pupil to a teacher over a window that closes on its own. The causes
  // are separated in `resolveFileVisibility` and the wording is chosen here.
  test("each refusal message reaches the page for its own cause and not the other", async () => {
    const reached = { role: [], "outside-window": [] };
    for (const role of ["student", "teacher"]) {
      const session = shown.get(role).session;
      for (const file of restrictedFiles) {
        if (maySeeFile(carried.get(role), file)) continue;
        const cause = file.windowClosed ? "outside-window" : "role";
        const expected = refusalFor(file);
        const unexpected = file.windowClosed ? refusal : closedWindowRefusal;
        const { text } = await render(session, file.path);
        assert.ok(
          text.includes(expected),
          file.windowClosed
            ? `every window on ${file.path} has closed, so the ${role} session should be told ` +
              `the content is not visible right now`
            : `${file.path} names ${file.directive.join(", ")}, the ${role} session holds none of ` +
              `them, so the page should carry the role refusal`
        );
        assert.ok(
          !text.includes(unexpected),
          `the ${role} session was refused ${file.path} for the ${cause} cause but the page also ` +
            `carries the other message, so the two causes are not being told apart`
        );
        reached[cause].push(`${role} on ${file.path}`);
      }
    }
    for (const cause of ["role", "outside-window"]) {
      assert.ok(
        reached[cause].length > 0,
        `no session was refused for the ${cause} cause, so that message was never reached`
      );
    }
    console.log(
      `      the role refusal, reached by: ${reached.role.join(", ")}\n` +
        `      the closed-window refusal, reached by: ${reached["outside-window"].join(", ")}`
    );
  });

  // ---- 3.4 Time-bounded visibility ----

  for (const block of timedBlocks) {
    test(`${block.what} on ${timedPage} follows its window`, () => {
      for (const role of ["student", "teacher"]) {
        const held = carried.get(role);
        const granted =
          [...(block.unwindowed ?? []), ...(block.open ?? [])].some((role_) => held.has(role_)) ||
          held.has("admin");
        assert.equal(
          rendered(role, timedPage).includes(block.text),
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
        !downgraded.text.includes(teacherBlock.text),
        "with the teacher view dropped, the teacher-only block should be gone from the page"
      );
      // The alias is stripped along with the role it projects, so the plural
      // spelling must not outlive the downgrade either.
      const downgradedAlias = await render(teacher, aliasPage);
      assert.ok(
        !downgradedAlias.text.includes(aliasBlock.text),
        `with the teacher view dropped, ${aliasBlock.what} should be gone from ${aliasPage}`
      );
      // The downgrade deletes `teacher`, `teachers` and `admin` and nothing
      // else: it exists to reach the student view, so whatever the session's
      // own `student` role is, dropping the teacher view leaves it - and its
      // plural alias - exactly as it was.
      const holdsStudent = carried.get("teacher").has("student");
      const downgradedStudent = await render(teacher, studentAliasPage);
      for (const block of studentAliasBlocks) {
        assert.equal(
          downgradedStudent.text.includes(block.text),
          holdsStudent,
          `with the teacher view dropped, ${block.what} of ${studentAliasPage} should ` +
            `${holdsStudent ? "still be visible" : "still be absent"}: the teacher session ` +
            `${holdsStudent ? "holds" : "does not hold"} "student", and the downgrade does not touch that role`
        );
      }
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
      restored.text.includes(teacherBlock.text),
      "with the teacher view back on, the teacher-only block should be visible again"
    );
    const restoredAlias = await render(teacher, aliasPage);
    assert.ok(
      restoredAlias.text.includes(aliasBlock.text),
      `with the teacher view back on, ${aliasBlock.what} should be visible again`
    );
    assert.ok(
      (await treeEntries(teacher)).includes(teacherFile.path),
      `with the teacher view back on, ${teacherFile.path} should be in the navigation tree again`
    );
  });

  // ---- 3.5a The same rule over content that has no corpus file ----

  /**
   * Posts a Markdown body to `/convert` from inside the session's own page, so
   * the request carries the session cookie the browser already holds. `/convert`
   * renders a body that has no file behind it, which is why the shared decision
   * takes a parsed directive rather than a path: there is no path to take.
   */
  const convert = async (session, content) => {
    const answer = await session.page.evaluate(async (body) => {
      const response = await fetch("/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ content: body }),
      });
      return { status: response.status, body: await response.text() };
    }, content);
    assert.equal(
      answer.status,
      200,
      `/convert answered ${answer.status} for the ${session.role} session; the harness is not ` +
        `posting as an authenticated user, so what follows would not be testing the directive`
    );
    return answer.body;
  };

  test("a posted body whose first line is a directive the session fails is refused", async () => {
    for (const role of ["student", "teacher"]) {
      const session = shown.get(role).session;
      await render(session, timedPage);

      // A role no demo account can hold, so this direction is exercised for
      // both sessions no matter what the identity provider hands out.
      const unheld = "@@@ nobody-holds-this-role\nThe body behind the directive.";
      const denied = await convert(session, unheld);
      assert.ok(
        denied.includes(refusal),
        `/convert should refuse the ${role} session a body addressed to a role it does not hold`
      );
      assert.ok(
        !denied.includes("The body behind the directive."),
        `/convert refused the ${role} session but handed back the body anyway`
      );

      // The other cause: a window that closed in the past leaves no role active,
      // so the directive hides the body from everyone - including a teacher.
      // No corpus file carries a whole-file directive with a window, so this is
      // the one route on which that message can be reached today.
      const closed = "@@@ teacher[2025-01-01T00:00:00 to 2025-01-02T00:00:00]\nThe body behind the window.";
      const expired = await convert(session, closed);
      assert.ok(
        expired.includes(closedWindowRefusal),
        `/convert should tell the ${role} session that a body whose directive window has closed ` +
          `is not visible right now, whatever roles the session holds`
      );
      assert.ok(
        !expired.includes("The body behind the window."),
        `/convert refused the ${role} session over a closed window but handed back the body anyway`
      );

      // And the directive still has to let content through when it is met, or
      // the two assertions above would pass against a route that refuses
      // everything. The directive is built from the roles this session actually
      // carries rather than from role names this repository does not own, so it
      // is met whatever the demo accounts turn out to hold.
      const held = [...carried.get(role)].filter((r) => !r.includes(","));
      assert.ok(
        held.length > 0,
        `the ${role} session carries no role at all, so there is no directive it could meet`
      );
      const open = `@@@ ${held.join(", ")}\nThe body every session may read.`;
      const allowed = await convert(session, open);
      assert.ok(
        allowed.includes("The body every session may read."),
        `/convert should hand the ${role} session a body whose directive names a role it holds`
      );
      assert.ok(
        !allowed.includes("@@@"),
        `/convert should strip the directive line from a body it hands back to the ${role} session`
      );
    }
  });

  // ---- 3.6 The harness against the application ----

  test("the roles the harness derives agree with what the application shows", () => {
    for (const role of ["student", "teacher"]) {
      assert.equal(
        carried.get(role).has("teacher"),
        rendered(role, permissionsPage).includes(teacherBlock.text),
        `the harness says the ${role} session ${carried.get(role).has("teacher") ? "holds" : "does not hold"} ` +
          `"teacher", but ${permissionsPage} shows the opposite. One of the two is wrong.`
      );
    }
  });
});
