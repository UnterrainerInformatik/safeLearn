/**
 * Embedded exam-module elements on an instance without the module
 * (`exam-embedding`, `exam-foundation`).
 *
 * Reads `md/test-exam-embedding.md`: a `safelearn-test` block in the open, a
 * second one and a `safelearn-gradebook` block inside `@@@ teacher`, a block of
 * an unknown kind
 * and the syntax as an example inside a longer fence. Without the module a
 * teacher sees a notice per known element and a student sees nothing, nor does
 * a teacher in student view; no page names the module's script or asks
 * `/exam/` for anything, and every path under `/exam/` answers as a path with
 * nothing behind it. The same page with the module on is `test/exam.test.js`.
 *
 * This is a module, not a test file: `test/content.test.js` imports it.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { applicationUrl, render, setPreferences, sharedSession } from "../harness.js";

const fixture = "/md/test-exam-embedding.md";

/** A path no deployment has a file for: the shape of "nothing behind it". */
const absent = "/no-deployment-has-a-file-at-this-path-exam-7d1e.json";

/** What the rendered page holds of the module, read from the live document. */
async function moduleTraces(page) {
  return page.evaluate(() => ({
    notices: [...document.querySelectorAll(".sl-embed-notice")].map((n) => n.textContent),
    placeholders: document.querySelectorAll(".sl-embed").length,
    moduleScripts: [...document.querySelectorAll("script[src]")]
      .map((s) => s.getAttribute("src"))
      .filter((src) => src.startsWith("/exam/")),
    html: document.documentElement.outerHTML,
  }));
}

/** The page placing the gradebook's elements: results in the open, a gradebook for teachers. */
const gradebookFixture = "/md/test-exam-gradebook.md";

/** Renders the fixture and records every request the page made while loading. */
async function renderRecording(session, view = "page", page = fixture) {
  const requested = [];
  const record = (request) => requested.push(request.url());
  session.page.on("request", record);
  try {
    const rendered = await render(session, page, { view });
    return { ...(await moduleTraces(session.page)), text: rendered.text, requested };
  } finally {
    session.page.off("request", record);
  }
}

/** How a path answers a request carrying the session's cookies. */
async function answerTo(session, reference) {
  return session.page.evaluate(async (address) => {
    const response = await fetch(address, { credentials: "include" });
    return { status: response.status, servedFrom: new URL(response.url).pathname, redirected: response.redirected };
  }, `${applicationUrl}${reference}`);
}

describe("exam-module elements without the module", () => {
  let student;
  let teacher;

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
  });

  test("a teacher sees a notice for each known element, and nothing of the blocks' source", async () => {
    await setPreferences(teacher, {});
    const seen = await renderRecording(teacher);
    assert.equal(seen.notices.length, 3, "one notice per test and one for the gradebook in the teacher section");
    assert.equal(seen.notices.filter((notice) => notice.includes("test")).length, 2);
    assert.ok(seen.notices.some((notice) => notice.includes("gradebook")));
    assert.equal(seen.placeholders, 0, "without the module nothing is there to mount into");
    assert.ok(!seen.text.includes("embedding-fixture-test"), "the block's parameters are not shown");
    assert.ok(!seen.text.includes("embedding-fixture-course"));
    assert.ok(!seen.text.includes("nosuchkind"), "an unknown kind renders nothing, not even its source");
    assert.ok(seen.text.includes("embedding-fixture-example"), "the example inside a longer fence stays text");
    assert.deepEqual(seen.moduleScripts, [], "no page names the module's script");
    assert.ok(!seen.html.includes("sl-exam-button"), "nor offers a teacher a way to it");
    assert.deepEqual(
      seen.requested.filter((url) => new URL(url).pathname.startsWith("/exam/")),
      [],
      "the page makes no request to /exam/"
    );
  });

  test("a student sees nothing in place of an element", async () => {
    await setPreferences(student, {});
    const seen = await renderRecording(student);
    assert.deepEqual(seen.notices, []);
    assert.equal(seen.placeholders, 0);
    assert.ok(!seen.text.includes("embedding-fixture-test"), "no trace of the test block");
    assert.ok(!seen.text.includes("embedding-fixture-course"), "nor of the gradebook block");
    assert.ok(!seen.html.includes("embedding-fixture-course"), "not even in the markup");
    assert.ok(!seen.html.includes("embedding-fixture-teacher-test"), "nor of the test block in the teacher section");
    assert.ok(!seen.html.includes("sl-exam-button"), "nor a button to the module's pages");
    assert.match(seen.text, /Text before the element\.[\s\S]*Text between the elements\.[\s\S]*Text after the elements\./);
  });

  test("a teacher in student view sees what a student sees", async () => {
    await setPreferences(teacher, { vt: 0 });
    try {
      const seen = await renderRecording(teacher);
      assert.deepEqual(seen.notices, []);
      assert.equal(seen.placeholders, 0);
    } finally {
      await setPreferences(teacher, {});
    }
  });

  test("the presentation and document views render the elements as notices too", async () => {
    await setPreferences(teacher, {});
    for (const view of ["presentation", "document"]) {
      const seen = await renderRecording(teacher, view);
      assert.equal(seen.notices.length, 3, `the ${view} view shows the notices`);
      assert.equal(seen.placeholders, 0, `the ${view} view mounts nothing`);
    }
  });

  test("the gradebook's elements are a notice each for a teacher and nothing for a student", async () => {
    await setPreferences(teacher, {});
    await setPreferences(student, {});
    const asTeacher = await renderRecording(teacher, "page", gradebookFixture);
    assert.equal(asTeacher.notices.length, 2);
    assert.ok(asTeacher.notices[0].includes("results"));
    assert.ok(asTeacher.notices[1].includes("gradebook"));
    const asStudent = await renderRecording(student, "page", gradebookFixture);
    assert.deepEqual(asStudent.notices, []);
    assert.ok(!asStudent.html.includes("9XGB"), "no trace of the gradebook block");
    for (const seen of [asTeacher, asStudent]) {
      assert.equal(seen.placeholders, 0);
      assert.deepEqual(seen.requested.filter((url) => new URL(url).pathname.startsWith("/exam/")), []);
    }
  });

  test("every path under /exam/ answers as a path with nothing behind it", async () => {
    const nothing = await answerTo(teacher, absent);
    for (const reference of ["/exam/", "/exam/api/me", "/exam/assets/exam-client.js", "/exam/results", "/exam/api/my/results"]) {
      assert.deepEqual(
        await answerTo(teacher, reference),
        nothing,
        `${reference} should answer the way ${absent} does on an instance without the module`
      );
    }
  });
});
