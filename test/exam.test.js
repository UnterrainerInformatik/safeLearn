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
import { openDatabase } from "../exam/db.js";
import { importPool } from "../exam/pool-import.js";

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
    const pages = ["/exam/", `/exam/classes/${klass.id}`, "/exam/courses/1"];

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
  let klass;
  let course;
  let test1;
  let entry;

  /** The student's GB course in their own results. */
  async function ownResults(session = student) {
    const answer = await fetchAs(session, "/exam/api/my/results");
    assert.equal(answer.status, 200);
    return { answer, gb: answer.json.courses.find((c) => c.subject === "GB") };
  }

  /** The row of `username` in the course's sheet for `semester`. */
  async function overviewRow(username, semester = "ws") {
    const answer = await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=${semester}`);
    assert.equal(answer.status, 200, JSON.stringify(answer.json));
    return answer.json.students.find((row) => row.username === username);
  }

  /** A column of the course, created through the API. */
  async function addColumn(body) {
    const created = await fetchAs(teacher, `/exam/api/courses/${course.id}/assessments`, { method: "POST", body });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    return created.json;
  }

  /** One student's result in one column, through the API. */
  function putResult(column, username, body) {
    return fetchAs(teacher, `/exam/api/assessments/${column.id}/results/${username}`, { method: "PUT", body });
  }

  /** Opens the course's sheet for `semester` as a teacher, once the client drew it. */
  async function openSheet(semester = "ws") {
    await teacher.page.goto(`${applicationUrl}/exam/courses/${course.id}/gradebook?semester=${semester}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-sheet", { timeout: 20000 });
  }

  /** The selector of a student's field in a column of the sheet. */
  const field = (column, username) => `input.sl-exam-cell[data-assessment="${column.id}"][data-student="${username}"]`;

  /** Replaces a field's value as a teacher would - select it, type, leave it - and waits for the save. */
  async function enter(selector, text) {
    const page = teacher.page;
    await page.focus(selector);
    await page.evaluate((s) => document.querySelector(s).select(), selector);
    if (text === "") await page.keyboard.press("Backspace");
    else await page.keyboard.type(text);
    await page.keyboard.press("Tab");
    await settled(selector);
  }

  /** Waits until a field is no longer being saved. */
  async function settled(selector) {
    await teacher.page.waitForFunction((s) => !document.querySelector(s).classList.contains("is-saving"), { timeout: 10000 }, selector);
  }

  /** The focused field's student and column, or null when the focus is not in a result field. */
  function focused() {
    return teacher.page.evaluate(() => {
      const element = document.activeElement;
      return element?.classList.contains("sl-exam-cell") ? { student: element.dataset.student, column: Number(element.dataset.assessment), value: element.value } : null;
    });
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
    const created = await fetchAs(teacher, `/exam/api/years/${year.id}/classes`, {
      method: "POST",
      body: { name: "9XGB", students: [student.username, other] },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    klass = created.json;
    const gb = await fetchAs(teacher, `/exam/api/classes/${klass.id}/courses`, {
      method: "POST",
      body: { subject: "GB", language: "de", weights: { onlineTests: 40, manualTests: 30, participation: 15, homework: 15 } },
    });
    assert.equal(gb.status, 200, JSON.stringify(gb.json));
    course = gb.json;
  });

  test("results in columns become a proposal, end to end", async () => {
    const username = student.username.toLowerCase();
    const date = year.startsOn;
    test1 = await addColumn({ kind: "test", name: "1st test", date, maxPoints: 24 });
    const round = await addColumn({ kind: "plusminus", date });
    const homework = await addColumn({ kind: "homework", name: "Essay", date });
    assert.equal(round.name, date, "a column without a name is named by its date");
    for (const [column, who, body] of [
      [test1, username, { points: 18 }],
      [round, username, { mark: "+" }],
      [homework, username, { percent: 90 }],
      [test1, other, { points: 6 }],
    ]) {
      const answer = await putResult(column, who, body);
      assert.equal(answer.status, 200, JSON.stringify(answer.json));
    }

    const row = await overviewRow(username);
    assert.deepEqual(row.results[test1.id], { value: 0.75, points: 18 }, "17/24-style points are kept");
    assert.equal(row.categories.manualTests.fraction, 0.75);
    assert.equal(row.categories.participation.fraction, 1);
    assert.equal(row.categories.homework.fraction, 0.9);
    assert.equal(row.categories.onlineTests, undefined, "no online test yet, so the category is left out");
    // (30 × 0.75 + 15 × 1 + 15 × 0.9) / 60
    assert.ok(Math.abs(row.proposal.fraction - 0.85) < 1e-9, `the proposal is ${row.proposal.fraction}`);
    assert.equal(row.proposal.grade, 2);
    assert.equal(row.effective, 2);
    assert.equal((await overviewRow(other)).effective, 5);

    const record = await fetchAs(teacher, `/exam/api/courses/${course.id}/students/${username}`);
    entry = record.json.entries.find((e) => e.columnId === test1.id);
    assert.deepEqual([entry.points, entry.maxPoints, entry.grade, entry.name], [18, 24, 2, "1st test"]);

    assert.equal((await putResult(test1, "not-on-the-roster", { points: 1 })).status, 400, "only a student on the roster gets a result");
    assert.equal((await putResult(test1, username, { points: 30 })).status, 400, "nor more points than the maximum");
    const batch = await fetchAs(teacher, `/exam/api/courses/${course.id}/entries`, {
      method: "POST",
      body: { entries: [{ username, kind: "test", fraction: 1, date }] },
    });
    assert.ok(!(batch.status === 200 && batch.json !== null), "the batch route is gone");
    assert.equal((await overviewRow(username)).entries, 3, "and recorded nothing");
  });

  test("the student sees their proposal, then the override instead, and the comment only once it is visible", async () => {
    const username = student.username.toLowerCase();
    let { gb } = await ownResults();
    assert.ok(gb, "the student's results list the course");
    assert.deepEqual([gb.semesters.ws.grade, gb.semesters.ws.overridden], [2, false]);
    assert.ok(Math.abs(gb.semesters.ws.fraction - 0.85) < 1e-9);
    assert.ok(gb.entries.some((e) => e.name === "1st test" && e.date === year.startsOn), "a result carries its column's name and date");

    const grade = (body) =>
      fetchAs(teacher, `/exam/api/courses/${course.id}/grades/${username}/ws`, { method: "PUT", body });
    assert.equal((await grade({ override: 1, comment: "strong oral exam", commentVisible: false })).status, 200);
    ({ gb } = await ownResults());
    assert.deepEqual([gb.semesters.ws.grade, gb.semesters.ws.fraction, gb.semesters.ws.overridden, gb.semesters.ws.comment], [1, null, true, null]);
    const row = await overviewRow(username);
    assert.deepEqual([row.proposal.grade, row.override, row.comment, row.effective], [2, 1, "strong oral exam", 1], "teachers see both");

    await grade({ commentVisible: true });
    ({ gb } = await ownResults());
    assert.equal(gb.semesters.ws.comment, "strong oral exam", "saving the visibility alone keeps override and comment");
    assert.equal(gb.semesters.ws.grade, 1);

    await student.page.goto(`${applicationUrl}/exam/results`, { waitUntil: "domcontentloaded" });
    await student.page.waitForFunction(() => document.querySelector(".sl-exam-results"), { timeout: 20000 });
    const page = await student.page.evaluate(() => document.querySelector(".sl-exam-results").textContent);
    assert.match(page, /GB – 9XGB/);
    assert.match(page, /grade 1/);
    assert.match(page, /strong oral exam/);
    assert.match(page, /1st test/, "the result is shown by its column's name");
  });

  test("a student reaches nobody else's data and no teacher route, nor does a teacher in student view", async () => {
    const api = [
      ["GET", `/exam/api/courses/${course.id}/gradebook`],
      ["GET", `/exam/api/courses/${course.id}/students/${other}`],
      ["POST", `/exam/api/courses/${course.id}/assessments`, { kind: "test", date: year.startsOn }],
      ["PUT", `/exam/api/assessments/${test1.id}`, { name: "renamed" }],
      ["DELETE", `/exam/api/assessments/${test1.id}`],
      ["PUT", `/exam/api/assessments/${test1.id}/results/${other}`, { points: 24 }],
      ["DELETE", `/exam/api/assessments/${test1.id}/results/${other}`],
      ["PUT", `/exam/api/courses/${course.id}/grades/${other}/ws`, { override: 1 }],
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
    assert.deepEqual(after.json.entries.map((e) => [e.name, e.points]), [["1st test", 6]], "nothing a refused request asked for happened");
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
        bar: Boolean(document.querySelector(".sl-exam-bar")),
      }));
    };

    await render(student, fixturePage);
    const asStudent = await drawn(student, [".sl-exam-results"]);
    assert.deepEqual(asStudent.kinds, ["results"]);
    assert.match(asStudent.results, /grade 1/);
    assert.match(asStudent.results, /18\/24/, "the result as it was entered");

    await render(teacher, fixturePage);
    const asTeacher = await drawn(teacher, [".sl-exam-results", ".sl-exam-gradebook"]);
    assert.deepEqual(asTeacher.kinds, ["results", "gradebook"]);
    assert.equal(asTeacher.gradebookRows, 2, "the student and the one the directory does not know");
    assert.match(asTeacher.results, /no results for you/, "a teacher is on no roster");
    assert.equal(asTeacher.bar, false, "an embedded element brings no module bar");

    await setPreferences(teacher, { vt: 0 });
    try {
      await render(teacher, fixturePage);
      const inStudentView = await drawn(teacher, [".sl-exam-results"]);
      assert.deepEqual(inStudentView.kinds, ["results"], "no gradebook in student view");
    } finally {
      await setPreferences(teacher, {});
    }
  });

  test("the sheet: the + of a category adds a column, and the category heading spans its columns", async () => {
    await openSheet();
    const heading = () =>
      teacher.page.evaluate(() => {
        const cell = [...document.querySelectorAll(".sl-exam-sheet .sl-exam-category")].find((th) => th.textContent.startsWith("Manual tests"));
        return { span: cell.colSpan, heads: document.querySelectorAll(".sl-exam-sheet .sl-exam-column-head[data-column]").length };
      });
    assert.equal((await heading()).span, 1, "one manual test so far");
    assert.equal(
      await teacher.page.evaluate(() => document.querySelectorAll(".sl-exam-sheet .sl-exam-category button.sl-exam-add").length),
      3,
      "a + for manual tests, participation and homework, none for online tests"
    );

    await teacher.page.click('button.sl-exam-add[aria-label="Add a column to Manual tests"]');
    await teacher.page.waitForSelector("dialog[open] input[name=name]");
    await teacher.page.type("dialog[open] input[name=name]", "2nd test");
    await teacher.page.type("dialog[open] input[name=maxPoints]", "20");
    await teacher.page.click("dialog[open] button[type=submit]");
    await teacher.page.waitForFunction(
      () => [...document.querySelectorAll(".sl-exam-column-head input[type=text]")].some((input) => input.value === "2nd test"),
      { timeout: 10000 }
    );
    assert.equal((await heading()).span, 2, "the heading spans both manual tests");

    const columns = (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=ws`)).json.columns;
    const added = columns.find((c) => c.name === "2nd test");
    assert.ok(added, "the column exists");
    assert.deepEqual([added.kind, added.maxPoints], ["test", 20]);
    assert.deepEqual(columns.map((c) => c.category), ["manualTests", "manualTests", "participation", "homework"], "grouped by category in the config sheet's order");
  });

  test("the sheet: a typed result is stored as it changes, emptying removes it, a refused value leaves the stored one", async () => {
    await openSheet();
    const columns = (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=ws`)).json.columns;
    const test2 = columns.find((c) => c.name === "2nd test");
    const target = field(test2, other);

    await enter(target, "15");
    let row = await overviewRow(other);
    assert.deepEqual(row.results[test2.id], { value: 0.75, points: 15 }, "stored without any save action");
    const shown = await teacher.page.evaluate((who) => document.querySelector(`tr[data-student="${who}"] .sl-exam-proposal`).textContent, other);
    assert.ok(shown.startsWith(String(row.proposal.grade)), `the row's proposal follows: ${shown}`);
    assert.equal(await teacher.page.evaluate((s) => document.querySelector(s).classList.contains("is-saved"), target), true);

    await enter(target, "25");
    const refused = await teacher.page.evaluate((s) => {
      const input = document.querySelector(s);
      return { marked: input.classList.contains("is-refused"), reason: input.title, value: input.value };
    }, target);
    assert.equal(refused.marked, true, "the field is marked as refused");
    assert.match(refused.reason, /maximum/, "with the reason");
    assert.equal(refused.value, "25", "and keeps what was typed");
    assert.deepEqual((await overviewRow(other)).results[test2.id], { value: 0.75, points: 15 }, "the stored result is unchanged");

    await enter(target, "");
    row = await overviewRow(other);
    assert.equal(row.results[test2.id], undefined, "emptying the field removes the result");
  });

  test("the sheet: the override is saved as it changes, and one row at a time is marked", async () => {
    await openSheet();
    const select = `tr[data-student="${other}"] select.sl-exam-override`;
    await teacher.page.select(select, "3");
    await settled(select);
    const row = await overviewRow(other);
    assert.deepEqual([row.override, row.effective], [3, 3]);
    assert.equal(await teacher.page.evaluate((who) => document.querySelector(`tr[data-student="${who}"] .sl-exam-grade`).textContent, other), "3");
    await teacher.page.select(select, "");
    await settled(select);
    assert.equal((await overviewRow(other)).override, null);

    const username = student.username.toLowerCase();
    await teacher.page.click(`tr[data-student="${username}"] .sl-exam-proposal`);
    await teacher.page.click(`tr[data-student="${other}"] .sl-exam-proposal`);
    const marked = await teacher.page.evaluate(() => [...document.querySelectorAll(".sl-exam-sheet tr.is-marked")].map((tr) => tr.dataset.student));
    assert.deepEqual(marked, [other], "only the second row is marked");
  });

  test("the sheet: the left four columns keep their place while the sheet scrolls sideways", async () => {
    await openSheet();
    const lefts = () =>
      teacher.page.evaluate(() => ({
        sticky: [...document.querySelectorAll(".sl-exam-sheet tbody tr:first-child [data-sticky]")].map((cell) => Math.round(cell.getBoundingClientRect().left)),
        field: Math.round(document.querySelector(".sl-exam-sheet tbody tr:first-child input.sl-exam-cell").getBoundingClientRect().left),
      }));
    // A narrow wrapper, so the sheet is wider than the room it has.
    await teacher.page.evaluate(() => {
      document.querySelector(".sl-exam-scroll").style.maxWidth = "420px";
    });
    await teacher.page.waitForFunction(() => {
      const wrapper = document.querySelector(".sl-exam-scroll");
      return wrapper.scrollWidth > wrapper.clientWidth;
    });
    const before = await lefts();
    assert.equal(before.sticky.length, 4, "name, proposal, override and grade");
    const scrolled = await teacher.page.evaluate(() => {
      const wrapper = document.querySelector(".sl-exam-scroll");
      wrapper.scrollLeft = 200;
      return wrapper.scrollLeft;
    });
    assert.ok(scrolled > 0, "the scrollbar belongs to the sheet");
    const after = await lefts();
    after.sticky.forEach((left, index) => assert.ok(Math.abs(left - before.sticky[index]) <= 2, `column ${index} moved from ${before.sticky[index]} to ${left}`));
    assert.ok(before.field - after.field >= scrolled - 2, "the result columns scrolled");
    assert.equal(await teacher.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "the page itself does not scroll sideways");
  });

  test("the sheet: the arrow keys move between results, save the field left and never change a + or −", async () => {
    await openSheet();
    const username = student.username.toLowerCase();
    const { columns, students } = (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=ws`)).json;
    const [first, second] = students.map((row) => row.username);
    const test2 = columns.find((c) => c.name === "2nd test");
    const round = columns.find((c) => c.kind === "plusminus");
    const page = teacher.page;

    // Down and up along a column; the field left is saved.
    await page.focus(field(test2, first));
    await page.evaluate((s) => document.querySelector(s).select(), field(test2, first));
    await page.keyboard.type("12");
    await page.keyboard.press("ArrowDown");
    assert.deepEqual(await focused(), { student: second, column: test2.id, value: "" });
    await settled(field(test2, first));
    assert.deepEqual((await overviewRow(first)).results[test2.id], { value: 0.6, points: 12 }, "moving saved the field left");
    await page.keyboard.press("ArrowUp");
    assert.equal((await focused()).student, first);
    await page.keyboard.press("ArrowUp");
    assert.equal((await focused()).student, first, "at the sheet's edge the focus stays");

    // Inside a typed value the arrows move the cursor; at its end they move on.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.type("17.5");
    await page.keyboard.press("ArrowLeft");
    assert.deepEqual(await focused(), { student: second, column: test2.id, value: "17.5" }, "the cursor moved inside the value");
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    const secondMark = await page.evaluate((s) => document.querySelector(s).value, field(round, second));
    assert.deepEqual(await focused(), { student: second, column: round.id, value: secondMark }, "right at the end crosses into participation");
    await settled(field(test2, second));
    assert.equal((await overviewRow(second)).results[test2.id].points, 17.5);
    await page.keyboard.press("ArrowLeft");
    assert.equal((await focused()).column, test2.id, "left from a + or − field goes back");
    await page.keyboard.press("ArrowRight");
    assert.equal((await focused()).column, round.id, "and right again from a value arrived at");

    // Participation down the list: typed, never changed by an arrow.
    await page.keyboard.press("ArrowUp");
    await page.keyboard.type("+");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.type("-");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowDown");
    assert.deepEqual(await focused(), { student: second, column: round.id, value: "−" }, "the arrows left the mark as typed");
    await settled(field(round, first));
    await settled(field(round, second));
    assert.equal((await overviewRow(first)).results[round.id].value, 1);
    assert.equal((await overviewRow(second)).results[round.id].value, 0);
    assert.equal(await page.evaluate((s) => document.querySelector(s).value, field(round, first)), "+");
    assert.ok([first, second].includes(username));
  });

  test("the year view shows the winter grade beside the year proposal, combined by the winter share", async () => {
    const username = student.username.toLowerCase();
    const summer = await addColumn({ kind: "test", name: "summer test", date: year.summerStartsOn });
    assert.equal((await putResult(summer, username, { percent: 70 })).status, 200);
    const row = await overviewRow(username, "ss");
    // The winter semester is overridden to 1 (its band's middle, 94 %), the summer's own fraction is 0.70.
    assert.deepEqual(row.winter, { grade: 1, overridden: true });
    assert.ok(Math.abs(row.proposal.fraction - 0.82) < 1e-9, `the year proposal is ${row.proposal.fraction}`);
    assert.equal(row.proposal.grade, 2);

    await openSheet("ss");
    const seen = await teacher.page.evaluate((who) => ({
      leading: [...document.querySelectorAll(".sl-exam-sheet thead th[data-sticky]")].map((th) => th.textContent),
      winter: document.querySelector(`tr[data-student="${who}"] .sl-exam-winter`).textContent,
      proposal: document.querySelector(`tr[data-student="${who}"] .sl-exam-proposal`).textContent,
      columns: [...document.querySelectorAll('.sl-exam-column-head input[aria-label="Column name"]')].map((input) => input.value),
    }), username);
    assert.deepEqual(seen.leading, ["Student", "Winter", "Year proposal", "Override", "Grade"]);
    assert.equal(seen.winter, "1 (override)");
    assert.ok(seen.proposal.startsWith("2 ("), seen.proposal);
    assert.deepEqual(seen.columns, ["summer test"], "the summer semester's columns only");

    const share = await fetchAs(teacher, `/exam/api/courses/${course.id}`, { method: "PUT", body: { winterShare: 100 } });
    assert.equal(share.status, 200);
    assert.ok(Math.abs((await overviewRow(username, "ss")).proposal.fraction - 0.94) < 1e-9, "a new share recalculates the year");
    await fetchAs(teacher, `/exam/api/courses/${course.id}`, { method: "PUT", body: { winterShare: 50 } });
  });

  test("the config sheet saves its weights as they change, only while they add up to 100 %", async () => {
    const original = { onlineTests: 40, manualTests: 30, participation: 15, homework: 15 };
    await teacher.page.goto(`${applicationUrl}/exam/courses/${course.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-config input");
    const setWeight = async (label, value) => {
      const selector = `.sl-exam-config input[aria-label="${label}"]`;
      await teacher.page.focus(selector);
      await teacher.page.evaluate((s) => document.querySelector(s).select(), selector);
      await teacher.page.keyboard.type(value);
      await teacher.page.keyboard.press("Tab");
      await teacher.page.waitForFunction(() => !document.querySelector(".sl-exam-config").classList.contains("is-saving"));
    };
    const stored = async () => (await fetchAs(teacher, `/exam/api/courses/${course.id}`)).json.weights;
    try {
      await setWeight("Manual tests", "40");
      assert.deepEqual(await stored(), original, "nothing is saved at 110 %");
      assert.match(await teacher.page.evaluate(() => document.querySelector(".sl-exam").textContent), /Together 110 %/, "the sum is shown");
      await setWeight("Participation (+/−)", "5");
      assert.deepEqual(await stored(), { ...original, manualTests: 40, participation: 5 }, "saved once they are back at 100 %");
    } finally {
      await fetchAs(teacher, `/exam/api/courses/${course.id}`, { method: "PUT", body: { weights: original } });
    }
  });
});

describe("the module bar", () => {
  let student;
  let teacher;
  let year;
  let gbClass;
  let course;
  let spare;

  /** A page's markup as the server sends it, before any script ran. */
  async function html(session, reference) {
    return session.page.evaluate(async (address) => (await fetch(address, { credentials: "include" })).text(), `${applicationUrl}${reference}`);
  }

  /** The bar's positions as the page shows them: chosen text, link and whether a new one can be created. */
  function bar(page) {
    return page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll(".sl-exam-bar-position")].map((position) => {
          const select = position.querySelector("select");
          return [
            position.dataset.position,
            {
              chosen: select.value ? select.selectedOptions[0].textContent : null,
              link: position.querySelector("a")?.getAttribute("href") ?? null,
              create: position.querySelector("button") ? !position.querySelector("button").disabled : null,
            },
          ];
        })
      )
    );
  }

  async function open(reference) {
    await teacher.page.goto(`${applicationUrl}${reference}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-bar", { timeout: 20000 });
  }

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const classes = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json;
    gbClass = classes.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    const created = await fetchAs(teacher, `/exam/api/years/${year.id}/classes`, { method: "POST", body: { name: "9XBAR", students: [] } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    spare = created.json;
  });

  test("every teacher page carries the bar as it is first shown, with the right values and links", async () => {
    for (const reference of [
      "/exam/",
      `/exam/classes/${gbClass.id}`,
      `/exam/courses/${course.id}`,
      `/exam/courses/${course.id}/gradebook`,
      `/exam/courses/${course.id}/students/${student.username.toLowerCase()}`,
      "/exam/scale",
    ]) {
      assert.match(await html(teacher, reference), /class="sl-exam-bar"/, `${reference} carries the bar`);
    }

    await open(`/exam/courses/${course.id}/gradebook?semester=ws`);
    assert.deepEqual(await bar(teacher.page), {
      year: { chosen: `${year.name} (current)`, link: `/exam/?year=${year.id}`, create: true },
      class: { chosen: "9XGB", link: `/exam/classes/${gbClass.id}`, create: true },
      course: { chosen: "GB", link: `/exam/courses/${course.id}`, create: true },
      gradebook: { chosen: "Winter semester", link: `/exam/courses/${course.id}/gradebook?semester=ws`, create: null },
    });

    await open("/exam/");
    const home = await bar(teacher.page);
    assert.equal(home.year.chosen, `${year.name} (current)`, "the current school year when nothing else is chosen");
    assert.deepEqual([home.class.chosen, home.course.create], [null, false], "no course is offered without a class");
  });

  test("choosing a class opens its page and clears the course", async () => {
    await open(`/exam/courses/${course.id}/gradebook?semester=ws`);
    await Promise.all([
      teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      teacher.page.select('.sl-exam-bar select[data-position="class"]', String(spare.id)),
    ]);
    assert.equal(new URL(teacher.page.url()).pathname, `/exam/classes/${spare.id}`);
    await teacher.page.waitForSelector(".sl-exam-bar");
    const seen = await bar(teacher.page);
    assert.deepEqual([seen.class.chosen, seen.course.chosen, seen.gradebook.chosen], ["9XBAR", null, null]);
    const offered = await teacher.page.evaluate(() => [...document.querySelectorAll('.sl-exam-bar select[data-position="course"] option')].map((o) => o.textContent));
    assert.deepEqual(offered, ["–"], "the course position offers the courses of 9XBAR - none yet");
  });

  test("a new course is created from the bar and chosen afterwards", async () => {
    await open(`/exam/classes/${spare.id}`);
    await teacher.page.click('.sl-exam-bar button[data-create="course"]');
    await teacher.page.waitForSelector("dialog[open] input[name=subject]", { timeout: 20000 });
    await teacher.page.type("dialog[open] input[name=subject]", "NVS");
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click("dialog[open] button[type=submit]")]);
    const created = (await fetchAs(teacher, `/exam/api/classes/${spare.id}`)).json.courses.find((c) => c.subject === "NVS");
    assert.ok(created, "the course exists");
    assert.equal(new URL(teacher.page.url()).pathname, `/exam/courses/${created.id}`, "its config sheet is open");
    await teacher.page.waitForSelector(".sl-exam-bar");
    assert.equal((await bar(teacher.page)).course.chosen, "NVS");

    await teacher.page.click('.sl-exam-bar button[data-create="course"]');
    await teacher.page.waitForSelector("dialog[open] input[name=subject]", { timeout: 20000 });
    await teacher.page.type("dialog[open] input[name=subject]", "nvs");
    await teacher.page.click("dialog[open] button[type=submit]");
    await teacher.page.waitForFunction(() => document.querySelector("dialog[open] .sl-exam-message")?.textContent, { timeout: 10000 });
    assert.match(await teacher.page.evaluate(() => document.querySelector("dialog[open] .sl-exam-message").textContent), /already/, "a duplicate is refused as before");
  });

  test("no bar for a student, a teacher in student view, or anyone's own results", async () => {
    assert.doesNotMatch(await html(student, "/exam/results"), /sl-exam-bar/);
    assert.doesNotMatch(await html(teacher, "/exam/results"), /sl-exam-bar/, "a teacher's own results carry none either");
    assert.doesNotMatch(await html(student, `/exam/courses/${course.id}/gradebook`), /sl-exam-bar/);
    await setPreferences(teacher, { vt: 0 });
    try {
      for (const reference of ["/exam/", `/exam/courses/${course.id}/gradebook`]) {
        assert.doesNotMatch(await html(teacher, reference), /sl-exam-bar/, `${reference} in student view`);
      }
    } finally {
      await setPreferences(teacher, {});
    }
  });
});

describe("the question pool", () => {
  let student;
  let teacher;
  let questionId;
  let imageId;

  // A 1×1 PNG.
  const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  /** A trimmed Moodle export: one category, a question with an image, and one without. */
  const pool = (lang) => `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/HTTP/${lang === "de" ? "Grundlagen" : "Basics"}</text></category></question>
  <question type="multichoice"><name><text>Bild ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p style="color: red"><img src="@@PLUGINFILE@@/image.png" alt="">${lang} picture (1 richtige Antwort)</p>]]></text>
      <file name="image.png" path="/" encoding="base64">${pixel}</file></questiontext>
    <answer fraction="100" format="html"><text><![CDATA[<p>yes ${lang}</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>no ${lang}</p>]]></text></answer>
  </question>
  <question type="truefalse"><name><text>Wahr ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p>${lang} statement</p>]]></text></questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>
</quiz>`;

  /** An image request from inside the page: what it answered, without the bytes. */
  async function imageAs(session, reference) {
    return session.page.evaluate(async (address) => {
      const response = await fetch(address, { credentials: "include" });
      return {
        status: response.status,
        type: response.headers.get("content-type"),
        cache: response.headers.get("cache-control"),
        bytes: (await response.arrayBuffer()).byteLength,
      };
    }, `${applicationUrl}${reference}`);
  }

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    // The import runs beside the instance, as it does on babylon5: a second
    // connection to the run's database.
    const { db } = openDatabase(run.databasePath);
    try {
      importPool(db, pool("de"), pool("en"));
      const row = db.prepare("SELECT q.id AS questionId, i.id AS imageId FROM question q JOIN image i ON i.question_id = q.id").get();
      questionId = row.questionId;
      imageId = row.imageId;
    } finally {
      db.close();
    }
  });

  test("a teacher browses the categories and finds a question by its text", async () => {
    const tree = await fetchAs(teacher, "/exam/api/pool/categories");
    assert.equal(tree.status, 200);
    assert.deepEqual(
      tree.json.map((node) => [node.nameDe, node.nameEn, node.total, node.children.map((child) => [child.nameDe, child.nameEn])]),
      [["HTTP", "HTTP", 2, [["Grundlagen", "Basics"]]]]
    );
    const found = await fetchAs(teacher, "/exam/api/pool/questions?q=EN%20PICTURE");
    assert.deepEqual(found.json.map((q) => q.id), [questionId], "found by its English text, ignoring case");
    assert.equal((await fetchAs(teacher, "/exam/api/pool/questions?q=nothing-like-this")).json.length, 0);
  });

  test("the preview has both languages, the correct answers and the image from the module", async () => {
    const shown = (await fetchAs(teacher, `/exam/api/pool/questions/${questionId}`)).json;
    assert.match(shown.textDe, /de picture \(1 richtige Antwort\)/);
    assert.match(shown.textEn, /en picture/);
    assert.doesNotMatch(shown.textDe, /style=|base64|@@PLUGINFILE@@/);
    assert.ok(shown.textDe.includes(`src="/exam/api/images/${imageId}"`));
    assert.deepEqual(shown.answers.map((a) => [a.textDe, a.correct]), [["<p>yes de</p>", true], ["<p>no de</p>", false]]);
    assert.deepEqual(shown.usage, []);

    const image = await imageAs(teacher, `/exam/api/images/${imageId}`);
    assert.deepEqual(image, { status: 200, type: "image/png", cache: "private, no-store", bytes: Buffer.from(pixel, "base64").length });
    assert.equal((await imageAs(teacher, "/exam/api/images/999999")).status, 404);
  });

  test("the browser page draws the tree, the list and a preview with the answers marked", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/pool`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-pool-questions tbody tr", { timeout: 20000 });
    await teacher.page.click(`.sl-exam-pool-questions tr[data-question="${questionId}"] button`);
    await teacher.page.waitForSelector(".sl-exam-pool-question", { timeout: 10000 });
    await teacher.page.waitForFunction(() => [...document.querySelectorAll(".sl-exam-pool-text img")].every((img) => img.complete), {
      timeout: 10000,
    });
    const seen = await teacher.page.evaluate(() => ({
      heading: document.querySelector("#markdown-content h1")?.textContent,
      bar: Boolean(document.querySelector(".sl-exam-bar")),
      categories: [...document.querySelectorAll(".sl-exam-pool-category")].map((b) => b.textContent),
      rows: document.querySelectorAll(".sl-exam-pool-questions tbody tr").length,
      correct: [...document.querySelectorAll(".sl-exam-pool-answers li.is-correct")].map((li) => li.textContent.trim()),
      imageLoaded: [...document.querySelectorAll(".sl-exam-pool-text img")].every((img) => img.complete && img.naturalWidth === 1),
    }));
    assert.deepEqual(seen, {
      heading: "Question pool",
      bar: true,
      categories: ["All categories", "HTTP (2)", "Grundlagen (2)"],
      rows: 2,
      correct: ["✓yes de"],
      imageLoaded: true,
    });
    await teacher.page.click(".sl-exam-pool-languages button:last-child");
    assert.match(await teacher.page.$eval(".sl-exam-pool-text", (el) => el.textContent), /en picture/);
  });

  test("the home page leads a teacher to the pool", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector('a[href="/exam/pool"]', { timeout: 20000 });
  });

  test("no student, and no teacher in student view, reaches the pool, its preview or its images", async () => {
    const probe = async (session) => {
      const nothing = await fetchAs(session, absent);
      for (const reference of ["/exam/api/pool/categories", "/exam/api/pool/questions", `/exam/api/pool/questions/${questionId}`]) {
        assert.equal((await fetchAs(session, reference)).status, 403, `${reference} is refused`);
      }
      assert.equal((await imageAs(session, `/exam/api/images/${imageId}`)).status, 403, "an image outside a test is refused");
      assert.deepEqual(
        await imageAs(session, "/exam/api/images/999999"),
        await imageAs(session, `/exam/api/images/${imageId}`),
        "and refused the same way as one that does not exist"
      );
      assert.deepEqual(await fetchAs(session, "/exam/pool"), nothing, "the page is not there");
    };
    await probe(student);
    await setPreferences(teacher, { vt: 0 });
    try {
      await probe(teacher);
    } finally {
      await setPreferences(teacher, {});
    }
  });
});
