/**
 * Smoke test for the verification harness.
 *
 * These checks prove that the harness itself works: that it brings the
 * application up, completes the Keycloak login for both demo roles, and hands
 * back sessions that are genuinely authenticated, genuinely separate, and
 * genuinely the account they claim to be. Checks about SafeLearn's own content
 * belong in the suite built on top of this one.
 *
 * Note that these accounts are public and shared. A check must therefore address
 * every page by path and set every preference it depends on, rather than
 * assuming any starting state — see docs-testing.md.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, beforeEach, describe, test } from "node:test";

import puppeteer from "puppeteer";

import {
  applicationUrl,
  click,
  consoleErrors,
  currentUser,
  eventually,
  forgetConsoleErrors,
  keepEvidenceOnFailure,
  openPage,
  openSession,
  shutdown,
  trackPage,
  writeEvidence,
} from "./harness.js";

keepEvidenceOnFailure(import.meta.filename, { beforeEach, afterEach });
after(shutdown);

/**
 * A page whose content differs by role in both directions, so a login that
 * returns the wrong user's page cannot pass for the right one.
 */
const permissionsPage = "/md/test-perms.md";
const teacherOnlyText = "Only visible to teachers.";
const studentOnlyText = "Only visible to Stu Dent";

/** Reads the rendered markdown of a page. */
async function readPage(session, urlPath) {
  await openPage(session, urlPath, "#markdown-content");
  return session.page.$eval("#markdown-content", (element) => element.textContent);
}

/** The session shows authenticated application content, not a way back to the login. */
async function assertAuthenticated(session) {
  assert.equal(
    new URL(session.page.url()).origin,
    new URL(applicationUrl).origin,
    `the ${session.role} session should be on the application, but is on ${session.page.url()}`
  );
  assert.equal(
    await session.page.$('input[type="password"]'),
    null,
    `the ${session.role} session should not be looking at a login form`
  );
  assert.ok(
    await session.page.$("#sidebar"),
    `the ${session.role} session should see the application's page shell`
  );
  const content = await session.page.$eval("#markdown-content", (element) => element.textContent);
  assert.ok(
    content.trim().length > 0,
    `the ${session.role} session should see rendered content`
  );
  assert.equal(
    await currentUser(session),
    session.username,
    `the application should consider the ${session.role} session logged in as ${session.username}`
  );
}

/** Two sessions opened in this order share nothing and each stays itself. */
async function assertIndependent(firstRole, secondRole) {
  const first = await openSession(firstRole);
  const second = await openSession(secondRole);
  try {
    assert.notEqual(
      first.username,
      second.username,
      "the two roles should be two different accounts"
    );

    const sessionCookie = async (session) =>
      (await session.context.cookies()).find((cookie) => cookie.name === "connect.sid")?.value;
    const [firstCookie, secondCookie] = await Promise.all([
      sessionCookie(first),
      sessionCookie(second),
    ]);
    assert.ok(firstCookie, `the ${firstRole} session should carry an application session cookie`);
    assert.ok(secondCookie, `the ${secondRole} session should carry an application session cookie`);
    assert.notEqual(
      firstCookie,
      secondCookie,
      `opening ${secondRole} after ${firstRole} must not inherit its session cookie`
    );

    assert.equal(
      await currentUser(first),
      first.username,
      `the ${firstRole} session should still be itself while a ${secondRole} session is open`
    );
    assert.equal(
      await currentUser(second),
      second.username,
      `the ${secondRole} session should be itself and not inherit the ${firstRole} login`
    );
  } finally {
    await second.close();
    await first.close();
  }
}

test("a student session reaches authenticated application content", async () => {
  const session = await openSession("student");
  try {
    await assertAuthenticated(session);
  } finally {
    await session.close();
  }
});

test("a teacher session reaches authenticated application content", async () => {
  const session = await openSession("teacher");
  try {
    await assertAuthenticated(session);
  } finally {
    await session.close();
  }
});

test("two sessions in one run do not share cookies", async () => {
  await assertIndependent("student", "teacher");
});

test("the order the sessions are opened in changes nothing", async () => {
  await assertIndependent("teacher", "student");
});

test("the two sessions differ in what they are allowed to see", async () => {
  const student = await openSession("student");
  const teacher = await openSession("teacher");
  try {
    const asStudent = await readPage(student, permissionsPage);
    const asTeacher = await readPage(teacher, permissionsPage);

    assert.ok(
      asTeacher.includes(teacherOnlyText),
      "the teacher session should see the teacher-only paragraph"
    );
    assert.ok(
      !asStudent.includes(teacherOnlyText),
      "the student session should not see the teacher-only paragraph"
    );
    assert.ok(
      asStudent.includes(studentOnlyText),
      "the student session should see the paragraph addressed to it by name"
    );
    assert.ok(
      !asTeacher.includes(studentOnlyText),
      "the teacher session should not see the paragraph addressed to the student by name"
    );
  } finally {
    await teacher.close();
    await student.close();
  }
});

describe("the harness's click", () => {
  /**
   * A page whose button is replaced by a new one 100 ms after loading, the way
   * the client script redraws a bar or table: the old node is detached, the new
   * one is the one that counts. Only the new one records a click.
   */
  const redrawnButton = `<!doctype html>
    <button id="go">old</button>
    <output id="clicked"></output>
    <script>
      setTimeout(() => {
        const fresh = document.createElement("button");
        fresh.id = "go";
        fresh.textContent = "new";
        fresh.addEventListener("click", () => { document.getElementById("clicked").textContent = "new"; });
        document.getElementById("go").replaceWith(fresh);
      }, 100);
    </script>`;

  let browser;
  let page;
  after(() => browser?.close());

  test("lands on the element as it is after a redraw", async () => {
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();
    await page.setContent(redrawnButton);
    // The stale handle a direct click would take: the node that is about to go.
    const stale = await page.$("#go");
    await new Promise((resolve) => setTimeout(resolve, 150));
    await assert.rejects(stale.click(), /detached|not clickable|not an Element/, "the old node is gone, as in the race");
    await click(page, "#go");
    assert.equal(await page.$eval("#clicked", (o) => o.textContent), "new", "the click reached the redrawn button");
  });

  test("an element that never appears fails in bounded time and is named", async () => {
    const started = Date.now();
    await assert.rejects(click(page, "#never-there", { timeout: 500 }), (error) => {
      assert.match(error.message, /#never-there/, "the message names the selector");
      assert.match(error.message, /about:blank/, "the message names the URL");
      return true;
    });
    assert.ok(Date.now() - started < 3000, `it gave up after ${Date.now() - started} ms, not at its 500 ms bound`);
  });
});

describe("the harness's console-error record and failure evidence", () => {
  let browser;
  let page;
  after(() => browser?.close());

  /** Logs `message` as a console error from inside the page. */
  const logError = (message) => page.evaluate((text) => console.error(text), message);

  test("a check sees the console errors of its own run and none of the one before", async () => {
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();
    trackPage(page, "probe");
    await page.setContent("<!doctype html><p>probe</p>");

    await logError("from the previous check");
    await eventually(() => consoleErrors(page), ["from the previous check"]);
    // What `keepEvidenceOnFailure` does before every check.
    forgetConsoleErrors();
    await logError("from this check");

    assert.deepEqual(
      await eventually(() => consoleErrors(page), ["from this check"]),
      ["from this check"],
      "the record holds exactly the error of the current check"
    );
  });

  test("the evidence of a failed check holds the URL, a screenshot, the document and the console errors", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "safelearn-evidence-"));
    try {
      await page.setContent('<!doctype html><p id="marker">evidence marker</p>');
      forgetConsoleErrors();
      await logError("the logged failure");
      await eventually(() => consoleErrors(page), ["the logged failure"]);

      const written = await writeEvidence(directory, { error: new Error("the check's own failure") });
      assert.equal(written, 1, "one tracked page, one set of evidence");
      assert.deepEqual(
        readdirSync(directory).sort(),
        ["failure.txt", "probe-console.txt", "probe-dom.html", "probe-screenshot.png", "probe-url.txt"],
        "four files for the page, named by its label, and the failure"
      );
      assert.equal(readFileSync(path.join(directory, "probe-url.txt"), "utf8").trim(), page.url());
      assert.match(readFileSync(path.join(directory, "probe-dom.html"), "utf8"), /evidence marker/);
      assert.match(readFileSync(path.join(directory, "probe-console.txt"), "utf8"), /the logged failure/);
      assert.match(readFileSync(path.join(directory, "failure.txt"), "utf8"), /the check's own failure/);
      const png = readFileSync(path.join(directory, "probe-screenshot.png"));
      assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", "the screenshot is a PNG");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    assert.ok(!existsSync(directory));
  });
});

describe("the harness's openPage", () => {
  let browser;
  let page;
  after(() => browser?.close());

  /** A page whose `#ready` is in the document, hidden, from the start, and shown after `showAfterMs` (never, if null). */
  const revealedLater = (showAfterMs) =>
    "data:text/html," +
    encodeURIComponent(
      `<!doctype html><p id="ready" hidden>ready</p>` +
        (showAfterMs === null ? "" : `<script>setTimeout(() => { document.getElementById("ready").hidden = false; }, ${showAfterMs});</script>`)
    );

  test("waits for an element that is in the document at once but shown only later", async () => {
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();
    await openPage(page, revealedLater(300), "#ready");
    assert.equal(await page.$eval("#ready", (element) => element.checkVisibility()), true, "the element is shown when openPage returns");
  });

  test("an element that stays hidden fails in bounded time, naming the path, the selector and the URL", async () => {
    const address = revealedLater(null);
    const started = Date.now();
    await assert.rejects(openPage(page, address, "#ready", { timeout: 500 }), (error) => {
      assert.ok(error.message.startsWith(`${address} never showed #ready within 500 ms`), error.message);
      assert.match(error.message, /in the document but not visible/, "the message says what was missing");
      assert.match(error.message, /the page ended up at data:text\/html/, "the message names the final URL");
      return true;
    });
    assert.ok(Date.now() - started < 3000, `it gave up after ${Date.now() - started} ms, not at its 500 ms bound`);
  });
});
