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

  test("the top bar leads a teacher to the module, and nobody else; module pages use the whole width", async () => {
    const button = async (session) => {
      await render(session, plainPage);
      return session.page.evaluate(() => document.querySelector("#topbar a.sl-exam-button")?.getAttribute("href") ?? null);
    };
    assert.equal(await button(teacher), "/exam/");
    assert.equal(await button(student), null);
    await setPreferences(teacher, { vt: 0 });
    try {
      assert.equal(await button(teacher), null, "no button in student view, where the page is not shown");
    } finally {
      await setPreferences(teacher, {});
    }
    assert.equal(
      await teacher.page.evaluate(() => document.querySelector("#markdown-content").classList.contains("sl-wide")),
      false,
      "a content page keeps its reading column"
    );

    await teacher.page.goto(`${applicationUrl}/exam/`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.body.style.display !== "none", { timeout: 45000 });
    const wide = await teacher.page.evaluate(() => {
      const content = document.querySelector("#markdown-content");
      return { marked: content.classList.contains("sl-wide"), width: content.getBoundingClientRect().width, viewport: window.innerWidth };
    });
    assert.ok(wide.marked, "the module's page is marked wide");
    if (wide.viewport > 1200) {
      assert.ok(wide.width > 900, `the content is ${wide.width}px wide in a ${wide.viewport}px window, wider than the reading column`);
    }
  });

  test("a teacher's page mounts every element, and the client reports what it cannot show", async () => {
    await render(teacher, fixture);
    const seen = await moduleTraces(teacher.page);
    assert.deepEqual(seen.placeholders.map((p) => p.kind), ["test", "test", "gradebook"]);
    assert.equal(seen.placeholders[0].params.slTest, "embedding-fixture-test");
    assert.equal(seen.placeholders[1].params.slTest, "embedding-fixture-teacher-test");
    assert.equal(seen.placeholders[2].params.slCourse, "embedding-fixture-course");
    assert.equal(seen.notices, 0);
    assert.deepEqual(seen.moduleScripts, ["/exam/assets/exam-client.js"]);
    for (const placeholder of seen.placeholders.filter((p) => p.kind === "test")) {
      assert.match(placeholder.status, /not available on this instance yet/, "the client ran and drew its frame");
    }
    await teacher.page.waitForFunction(() => !document.querySelector("sl-exam-gradebook .sl-embed-status:not(.sl-embed-error)"), {
      timeout: 10000,
    });
    const gradebook = await teacher.page.evaluate(() => document.querySelector("sl-exam-gradebook").textContent.trim());
    assert.equal(gradebook, "This record does not exist.", "a gradebook naming no course says so in its own area");
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
      courses: [...document.querySelectorAll('a[href^="/exam/courses/"]:not([href$="/gradebook"])')].map((a) => a.textContent),
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

describe("the gradebook", () => {
  const fixturePage = "/md/test-exam-gradebook.md";
  const other = "gb-other-student";
  let student;
  let teacher;
  let year;
  let course;
  let entry;

  /** The student's GB course in their own results. */
  async function ownResults(session = student) {
    const answer = await fetchAs(session, "/exam/api/my/results");
    assert.equal(answer.status, 200);
    return { answer, gb: answer.json.courses.find((c) => c.subject === "GB") };
  }

  /** The row of `username` in the course's overview for `semester`. */
  async function overviewRow(username, semester = "ws") {
    const answer = await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=${semester}`);
    assert.equal(answer.status, 200, JSON.stringify(answer.json));
    return answer.json.students.find((row) => row.username === username);
  }

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    const years = await fetchAs(teacher, "/exam/api/years");
    year = years.json.current;
    if (!year) {
      year = (
        await fetchAs(teacher, "/exam/api/years", {
          method: "POST",
          body: { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" },
        })
      ).json;
    }
    // The class the fixture page names, with the shared student and one
    // username the directory does not know.
    const klass = await fetchAs(teacher, `/exam/api/years/${year.id}/classes`, {
      method: "POST",
      body: { name: "9XGB", students: [student.username, other] },
    });
    assert.equal(klass.status, 200, JSON.stringify(klass.json));
    const created = await fetchAs(teacher, `/exam/api/classes/${klass.json.id}/courses`, {
      method: "POST",
      body: { subject: "GB", language: "de", weights: { onlineTests: 40, manualTests: 30, participation: 15, homework: 15 } },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    course = created.json;
  });

  test("entries become a proposal, end to end", async () => {
    const username = student.username.toLowerCase();
    const date = year.startsOn;
    const recorded = await fetchAs(teacher, `/exam/api/courses/${course.id}/entries`, {
      method: "POST",
      body: {
        entries: [
          { username, kind: "test", points: 18, maxPoints: 24, date, note: "1st test" },
          { username, kind: "plusminus", mark: "+", date },
          { username, kind: "homework", fraction: 0.9, date },
          { username: other, kind: "test", points: 6, maxPoints: 24, date },
        ],
      },
    });
    assert.equal(recorded.status, 200, JSON.stringify(recorded.json));
    entry = recorded.json[0];
    assert.deepEqual([entry.points, entry.maxPoints, entry.grade], [18, 24, 2], "17/24-style points are kept and graded");

    const row = await overviewRow(username);
    assert.equal(row.categories.manualTests.fraction, 0.75);
    assert.equal(row.categories.participation.fraction, 1);
    assert.equal(row.categories.homework.fraction, 0.9);
    assert.equal(row.categories.onlineTests, undefined, "no online test yet, so the category is left out");
    // (30 × 0.75 + 15 × 1 + 15 × 0.9) / 60
    assert.ok(Math.abs(row.proposal.fraction - 0.85) < 1e-9, `the proposal is ${row.proposal.fraction}`);
    assert.equal(row.proposal.grade, 2);
    assert.equal(row.effective, 2);
    assert.equal((await overviewRow(other)).effective, 5);

    const refused = await fetchAs(teacher, `/exam/api/courses/${course.id}/entries`, {
      method: "POST",
      body: { entries: [{ username: "not-on-the-roster", kind: "test", fraction: 1, date }] },
    });
    assert.equal(refused.status, 400, "only a student on the roster gets an entry");
  });

  test("the student sees their proposal, then the override instead, and the comment only once it is visible", async () => {
    const username = student.username.toLowerCase();
    let { gb } = await ownResults();
    assert.ok(gb, "the student's results list the course");
    assert.deepEqual([gb.semesters.ws.grade, gb.semesters.ws.overridden], [2, false]);
    assert.ok(Math.abs(gb.semesters.ws.fraction - 0.85) < 1e-9);

    const grade = (body) =>
      fetchAs(teacher, `/exam/api/courses/${course.id}/grades/${username}/ws`, { method: "PUT", body });
    assert.equal((await grade({ override: 1, comment: "strong oral exam", commentVisible: false })).status, 200);
    ({ gb } = await ownResults());
    assert.deepEqual([gb.semesters.ws.grade, gb.semesters.ws.fraction, gb.semesters.ws.overridden, gb.semesters.ws.comment], [1, null, true, null]);
    const row = await overviewRow(username);
    assert.deepEqual([row.proposal.grade, row.override, row.comment, row.effective], [2, 1, "strong oral exam", 1], "teachers see both");

    await grade({ override: 1, comment: "strong oral exam", commentVisible: true });
    ({ gb } = await ownResults());
    assert.equal(gb.semesters.ws.comment, "strong oral exam");

    await student.page.goto(`${applicationUrl}/exam/results`, { waitUntil: "domcontentloaded" });
    await student.page.waitForFunction(() => document.querySelector(".sl-exam-results"), { timeout: 20000 });
    const page = await student.page.evaluate(() => document.querySelector(".sl-exam-results").textContent);
    assert.match(page, /GB – 9XGB/);
    assert.match(page, /grade 1/);
    assert.match(page, /strong oral exam/);
  });

  test("a student reaches nobody else's data and no teacher route, nor does a teacher in student view", async () => {
    const api = [
      ["GET", `/exam/api/courses/${course.id}/gradebook`],
      ["GET", `/exam/api/courses/${course.id}/students/${other}`],
      ["POST", `/exam/api/courses/${course.id}/entries`, { entries: [{ username: other, kind: "test", fraction: 1, date: year.startsOn }] }],
      ["PUT", `/exam/api/courses/${course.id}/grades/${other}/ws`, { override: 1 }],
      ["PUT", `/exam/api/entries/${entry.id}`, { kind: "test", fraction: 1, date: year.startsOn }],
      ["DELETE", `/exam/api/entries/${entry.id}`],
      ["GET", "/exam/api/scale"],
      ["PUT", "/exam/api/scale", { thresholds: { 1: 10, 2: 8, 3: 6, 4: 4 } }],
      ["GET", "/exam/api/course-lookup?class=9xgb&subject=GB"],
    ];
    const pages = [`/exam/courses/${course.id}/gradebook`, `/exam/courses/${course.id}/students/${other}`, "/exam/scale"];
    const probe = async (session) => {
      const nothing = await fetchAs(session, absent);
      for (const [method, reference, body] of api) {
        const answer = await fetchAs(session, reference, { method, body });
        assert.equal(answer.status, 403, `${method} ${reference} answered ${answer.status}`);
      }
      for (const reference of pages) {
        assert.deepEqual(await fetchAs(session, reference), nothing, `${reference} is not there`);
      }
      // The one route of a student's own takes no username; naming one changes nothing.
      for (const reference of [`/exam/api/my/results?username=${other}`, `/exam/api/my/results?user=${other}`]) {
        const answer = await fetchAs(session, reference);
        assert.equal(answer.status, 200);
        assert.ok(!JSON.stringify(answer.json).includes(other), `${reference} mentions ${other}`);
      }
    };

    await probe(student);
    await setPreferences(teacher, { vt: 0 });
    try {
      await probe(teacher);
    } finally {
      await setPreferences(teacher, {});
    }

    const after = await fetchAs(teacher, `/exam/api/courses/${course.id}/students/${other}`);
    assert.equal(after.json.entries.length, 1, "nothing a refused request asked for happened");
    assert.equal(after.json.semesters.ws.override, null);
    assert.equal((await fetchAs(teacher, "/exam/api/scale")).json[0].minPercent, 88);
  });

  test("the page's elements: the results for everyone, the gradebook for a teacher only", async () => {
    const drawn = async (session, selectors) => {
      await session.page.waitForFunction(
        (selectors) => selectors.every((selector) => document.querySelector(selector)),
        { timeout: 20000 },
        selectors
      );
      return session.page.evaluate(() => ({
        kinds: [...document.querySelectorAll(".sl-embed")].map((el) => el.dataset.slEmbed),
        results: document.querySelector(".sl-exam-results")?.textContent ?? "",
        gradebookRows: document.querySelectorAll(".sl-exam-gradebook tbody tr").length,
      }));
    };

    await render(student, fixturePage);
    const asStudent = await drawn(student, [".sl-exam-results"]);
    assert.deepEqual(asStudent.kinds, ["results"]);
    assert.match(asStudent.results, /grade 1/);
    assert.match(asStudent.results, /18\/24/, "the entry as it was entered");

    await render(teacher, fixturePage);
    const asTeacher = await drawn(teacher, [".sl-exam-results", ".sl-exam-gradebook"]);
    assert.deepEqual(asTeacher.kinds, ["results", "gradebook"]);
    assert.equal(asTeacher.gradebookRows, 2, "the student and the one the directory does not know");
    assert.match(asTeacher.results, /no results for you/, "a teacher is on no roster");

    await setPreferences(teacher, { vt: 0 });
    try {
      await render(teacher, fixturePage);
      const inStudentView = await drawn(teacher, [".sl-exam-results"]);
      assert.deepEqual(inStudentView.kinds, ["results"], "no gradebook in student view");
    } finally {
      await setPreferences(teacher, {});
    }
  });
});
