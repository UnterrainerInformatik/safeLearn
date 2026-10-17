/**
 * The instance with the exam module switched on (`browser-verification`).
 *
 * A test file of its own, so it runs in its own process against an instance of
 * its own: `useExamModule()` starts that instance with `EXAM_MODULE=on` and a
 * database in a directory created for this run, on a port of its own, and the
 * harness removes the directory when the run ends however it ends. Two runs
 * in a row therefore never see each other's records.
 *
 * The same fixture page without the module is `test/checks/exam-embedding.js`.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { after, before, describe, test } from "node:test";

import {
  applicationOutput,
  applicationUrl,
  render,
  setPreferences,
  sharedSession,
  shutdown,
  useExamModule,
} from "./harness.js";

const run = useExamModule();

const fixture = "/md/test-exam-embedding.md";
const plainPage = "/md/test-md-file.md";
const absent = "/no-deployment-has-a-file-at-this-path-exam-7d1e.json";

/**
 * A request from inside the page, carrying the session's cookies. `body`, if
 * given, is sent as JSON.
 */
async function fetchAs(session, reference, { method = "GET", body } = {}) {
  return session.page.evaluate(async (address, method, body) => {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(address, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Not JSON - a page.
    }
    return { status: response.status, servedFrom: new URL(response.url).pathname, redirected: response.redirected, json };
  }, `${applicationUrl}${reference}`, method, body);
}

/** What the rendered page holds of the module, once its client had a turn. */
async function moduleTraces(page) {
  await page
    .waitForFunction(
      () => [...document.querySelectorAll(".sl-embed")].every((el) => el.dataset.slMounted === "1"),
      { timeout: 10000 }
    )
    .catch(() => {});
  return page.evaluate(() => ({
    placeholders: [...document.querySelectorAll(".sl-embed")].map((el) => ({
      kind: el.dataset.slEmbed,
      params: { ...el.dataset },
      status: el.textContent.trim(),
    })),
    notices: document.querySelectorAll(".sl-embed-notice").length,
    moduleScripts: [...document.querySelectorAll("script[src]")]
      .map((s) => s.getAttribute("src"))
      .filter((src) => src.startsWith("/exam/")),
  }));
}

after(async () => {
  await shutdown();
  assert.ok(!existsSync(run.directory), `the run's database directory ${run.directory} should be gone after the run`);
});

describe("the instance with the exam module", () => {
  let student;
  let teacher;

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
  });

  test("starts the module against a database created for this run", () => {
    const output = applicationOutput();
    assert.match(output, /Exam module: active, database /);
    assert.ok(output.includes(run.databasePath), "the start-up log names the run's database");
    assert.match(output, /Migrated .* from schema version 0 to /, "the database was new, not one a previous run left");
    assert.ok(existsSync(run.databasePath));
    assert.ok(readdirSync(run.directory).includes("exam-backups"), "the backups sit beside the run's database");
  });

  test("answers who a session is, after the student-view downgrade", async () => {
    const asTeacher = await fetchAs(teacher, "/exam/api/me");
    assert.equal(asTeacher.status, 200);
    assert.deepEqual(asTeacher.json, { username: teacher.username.toLowerCase(), teacher: true });

    const asStudent = await fetchAs(student, "/exam/api/me");
    assert.deepEqual(asStudent.json, { username: student.username.toLowerCase(), teacher: false });

    await setPreferences(teacher, { vt: 0 });
    try {
      assert.equal((await fetchAs(teacher, "/exam/api/me")).json.teacher, false, "a teacher in student view is a student");
    } finally {
      await setPreferences(teacher, {});
    }
    assert.equal((await fetchAs(teacher, "/exam/api/me")).json.teacher, true, "and a teacher again after switching back");
  });

  test("refuses a request without a session the way every route does", async () => {
    const response = await fetch(`${applicationUrl}/exam/api/me`, { redirect: "manual" });
    assert.equal(response.status, 401);
  });

  test("shows its page to a teacher in the instance's frame, and to nobody else", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.body.style.display !== "none", { timeout: 45000 });
    const frame = await teacher.page.evaluate(() => ({
      title: document.title,
      topbar: document.querySelector("#topbar .topbar-title")?.textContent.trim(),
      sidebar: Boolean(document.querySelector("#sidebar")),
      heading: document.querySelector("#markdown-content h1")?.textContent,
    }));
    assert.deepEqual(frame, {
      title: "Classes and courses",
      topbar: "Classes and courses",
      sidebar: true,
      heading: "Classes and courses",
    });

    const nothing = await fetchAs(student, absent);
    assert.deepEqual(await fetchAs(student, "/exam/"), nothing, "a student finds nothing there");
    await setPreferences(teacher, { vt: 0 });
    try {
      assert.deepEqual(await fetchAs(teacher, "/exam/"), await fetchAs(teacher, absent), "nor does a teacher in student view");
    } finally {
      await setPreferences(teacher, {});
    }
  });

  test("a teacher's page mounts both elements, and the client reports what it cannot show yet", async () => {
    await render(teacher, fixture);
    const seen = await moduleTraces(teacher.page);
    assert.deepEqual(seen.placeholders.map((p) => p.kind), ["test", "test", "gradebook"]);
    assert.equal(seen.placeholders[0].params.slTest, "embedding-fixture-test");
    assert.equal(seen.placeholders[1].params.slTest, "embedding-fixture-teacher-test");
    assert.equal(seen.placeholders[2].params.slCourse, "embedding-fixture-course");
    assert.equal(seen.notices, 0);
    assert.deepEqual(seen.moduleScripts, ["/exam/assets/exam-client.js"]);
    for (const placeholder of seen.placeholders) {
      assert.match(placeholder.status, /not available on this instance yet/, "the client ran and drew its frame");
    }
  });

  test("a student's page holds the open test element only", async () => {
    await render(student, fixture);
    const seen = await moduleTraces(student.page);
    assert.deepEqual(seen.placeholders.map((p) => p.kind), ["test"], "nothing from the teacher section, no gradebook");
    assert.equal(seen.placeholders[0].params.slTest, "embedding-fixture-test");
  });

  test("a teacher in student view gets what a student gets", async () => {
    await setPreferences(teacher, { vt: 0 });
    try {
      await render(teacher, fixture);
      const seen = await moduleTraces(teacher.page);
      assert.deepEqual(seen.placeholders.map((p) => p.params.slTest), ["embedding-fixture-test"]);
    } finally {
      await setPreferences(teacher, {});
    }
  });

  test("the presentation and document views do not run elements", async () => {
    for (const view of ["presentation", "document"]) {
      await render(teacher, fixture, { view });
      const seen = await moduleTraces(teacher.page);
      assert.deepEqual(seen.placeholders, [], `the ${view} view holds no placeholder`);
      assert.equal(seen.notices, 3, `the ${view} view shows the notices instead`);
      assert.deepEqual(seen.moduleScripts, [], `the ${view} view loads no module script`);
    }
  });

  test("a page without an element does not load the module's script", async () => {
    await render(teacher, plainPage);
    assert.deepEqual((await moduleTraces(teacher.page)).moduleScripts, []);
  });

  test("the database is not retrievable over HTTP", async () => {
    const nothing = await fetchAs(teacher, absent);
    for (const reference of [
      "/data/exam.sqlite",
      "/exam/exam.sqlite",
      "/exam/assets/../db.js",
      "/exam/assets/%2e%2e/db.js",
      "/exam/migrations/001-skeleton.sql",
      "/exam/db.js",
    ]) {
      const answer = await fetchAs(teacher, reference);
      assert.ok(
        answer.status !== 200 || answer.servedFrom === nothing.servedFrom,
        `${reference} answered ${answer.status} from ${answer.servedFrom}; it must not serve a file`
      );
    }
  });
});

describe("classes and courses", () => {
  let student;
  let teacher;
  let year;
  let klass;
  let candidates;

  /**
   * The directory's class names once it holds them. The instance warms the
   * directory at start-up; until that fetch is done the module says "loading".
   */
  async function directoryClasses() {
    const deadline = Date.now() + 90000;
    for (;;) {
      const answer = await fetchAs(teacher, "/exam/api/directory/classes");
      assert.equal(answer.status, 200);
      assert.notEqual(
        answer.json.state,
        "unavailable",
        "the instance has no directory-service credentials (DIRECTORY_SERVICE_CLIENT_ID/_SECRET in .env)"
      );
      if (answer.json.ready) return answer.json.classes;
      assert.ok(Date.now() < deadline, "the directory should be loaded within 90 s");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
  });

  test("a teacher creates the school year, and it is the current one", async () => {
    const created = await fetchAs(teacher, "/exam/api/years", {
      method: "POST",
      body: { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    year = created.json;
    assert.equal(year.current, true);
    const again = await fetchAs(teacher, "/exam/api/years", { method: "POST", body: { ...year } });
    assert.equal(again.status, 409, "the same year twice is refused");
  });

  test("a roster is ticked from the demo realm's client-role class", async () => {
    const classes = await directoryClasses();
    assert.ok(classes.length > 0, "the demo realm grants at least one class as a client role");
    let name = null;
    for (const candidate of classes) {
      const answer = await fetchAs(teacher, `/exam/api/directory/classes/${candidate}`);
      if (answer.json.candidates.length > 0) {
        name = candidate;
        candidates = answer.json.candidates;
        break;
      }
    }
    assert.ok(name, `one of ${classes.join(", ")} should have a member who is not a teacher`);

    const created = await fetchAs(teacher, `/exam/api/years/${year.id}/classes`, {
      method: "POST",
      body: { name: name.toUpperCase(), students: candidates.map((c) => c.username) },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    klass = created.json;
    assert.equal(klass.name, name);
    assert.deepEqual(
      klass.roster.map((entry) => entry.username).sort(),
      candidates.map((c) => c.username).sort(),
      "exactly the ticked members"
    );
    const named = klass.roster.filter((entry) => entry.givenName || entry.familyName);
    assert.equal(named.length, candidates.filter((c) => c.givenName || c.familyName).length, "names come from the directory");
  });

  test("a teacher is never put on a roster", async () => {
    const answer = await fetchAs(teacher, `/exam/api/classes/${klass.id}/roster`, {
      method: "POST",
      body: { username: teacher.username },
    });
    assert.equal(answer.status, 400);
  });

  test("a student removed from the roster keeps their entry, marked as left", async () => {
    const username = student.username.toLowerCase();
    const added = await fetchAs(teacher, `/exam/api/classes/${klass.id}/roster`, { method: "POST", body: { username } });
    assert.equal(added.status, 200, JSON.stringify(added.json));
    const removed = await fetchAs(teacher, `/exam/api/classes/${klass.id}/roster/${username}`, { method: "DELETE" });
    assert.equal(removed.status, 200);
    const entry = removed.json.find((e) => e.username === username);
    assert.ok(entry, "the entry is still there");
    assert.ok(entry.leftAt, "and marked as left");
  });

  test("a course is created once per class and subject, however it is capitalized", async () => {
    const created = await fetchAs(teacher, `/exam/api/classes/${klass.id}/courses`, {
      method: "POST",
      body: { subject: "WMC", language: "en" },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    const duplicate = await fetchAs(teacher, `/exam/api/classes/${klass.id}/courses`, {
      method: "POST",
      body: { subject: "wmc", language: "de" },
    });
    assert.equal(duplicate.status, 409);

    const weights = { onlineTests: 50, manualTests: 30, participation: 10, homework: 10 };
    const saved = await fetchAs(teacher, `/exam/api/courses/${created.json.id}`, { method: "PUT", body: { weights } });
    assert.deepEqual(saved.json.weights, weights);
    const wrong = await fetchAs(teacher, `/exam/api/courses/${created.json.id}`, {
      method: "PUT",
      body: { weights: { ...weights, homework: 20 } },
    });
    assert.equal(wrong.status, 400, "weights that do not make 100 % are refused");
  });

  test("the class page draws the class for a teacher", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/classes/${klass.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.querySelector("#markdown-content h1")?.textContent.startsWith("Class "), {
      timeout: 20000,
    });
    const seen = await teacher.page.evaluate(() => ({
      heading: document.querySelector("#markdown-content h1").textContent,
      rows: document.querySelectorAll(".sl-exam-roster tr").length,
      courses: [...document.querySelectorAll('a[href^="/exam/courses/"]')].map((a) => a.textContent),
    }));
    assert.equal(seen.heading, `Class ${klass.name.toUpperCase()} – 2026/27`);
    assert.equal(seen.rows, candidates.length + 1, "the attending members and the one who left");
    assert.deepEqual(seen.courses, ["WMC"]);
  });

  test("no route of classes and courses answers a student, or a teacher in student view", async () => {
    const api = [
      ["GET", "/exam/api/years"],
      ["POST", "/exam/api/years", {}],
      ["POST", `/exam/api/years/${year.id}/current`],
      ["GET", `/exam/api/years/${year.id}/classes`],
      ["POST", `/exam/api/years/${year.id}/classes`, { name: "1xhif" }],
      ["GET", `/exam/api/classes/${klass.id}`],
      ["POST", `/exam/api/classes/${klass.id}/roster`, { username: "someone" }],
      ["DELETE", `/exam/api/classes/${klass.id}/roster/${candidates[0].username}`],
      ["POST", `/exam/api/classes/${klass.id}/names`],
      ["POST", `/exam/api/classes/${klass.id}/courses`, { subject: "X" }],
      ["GET", "/exam/api/courses/1"],
      ["PUT", "/exam/api/courses/1", { language: "de" }],
      ["GET", "/exam/api/directory/classes"],
      ["GET", `/exam/api/directory/classes/${klass.name}`],
      ["GET", "/exam/api/directory/people?q=st"],
    ];
    const pages = ["/exam/", `/exam/classes/new?year=${year.id}`, `/exam/classes/${klass.id}`, "/exam/courses/1"];

    const probe = async (session) => {
      const nothing = await fetchAs(session, absent);
      for (const [method, reference, body] of api) {
        const answer = await fetchAs(session, reference, { method, body });
        assert.equal(answer.status, 403, `${method} ${reference} answered ${answer.status}`);
      }
      for (const reference of pages) {
        assert.deepEqual(await fetchAs(session, reference), nothing, `${reference} is not there`);
      }
    };

    await probe(student);
    await setPreferences(teacher, { vt: 0 });
    try {
      await probe(teacher);
    } finally {
      await setPreferences(teacher, {});
    }

    const afterwards = await fetchAs(teacher, `/exam/api/classes/${klass.id}`);
    assert.equal(afterwards.json.roster.filter((e) => !e.leftAt).length, candidates.length, "nothing a refused request asked for happened");
    assert.equal(afterwards.json.courses.length, 1);
  });
});
