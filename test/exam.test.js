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
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import {
  applicationOutput,
  applicationUrl,
  reauthenticate,
  render,
  restartApplication,
  setPreferences,
  sharedSession,
  shutdown,
  useExamModule,
} from "./harness.js";
import { openDatabase } from "../exam/db.js";
import { importPool } from "../exam/pool-import.js";
import { purgeUploads } from "../exam/pool-edit.js";

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

  test("the top bar leads a teacher to the module and a student to their tests and results; module pages use the whole width", async () => {
    const buttons = async (session) => {
      await render(session, plainPage);
      return session.page.evaluate(() => [...document.querySelectorAll("#topbar a.sl-exam-button")].map((a) => a.getAttribute("href")));
    };
    assert.deepEqual(await buttons(teacher), ["/exam/"]);
    assert.deepEqual(await buttons(student), ["/exam/my/tests", "/exam/results"], "a student reaches both own pages from every page");
    await setPreferences(teacher, { vt: 0 });
    try {
      assert.deepEqual(await buttons(teacher), ["/exam/my/tests", "/exam/results"], "in student view, what a student gets, and not the module's home");
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
    await teacher.page.waitForFunction(() => ![...document.querySelectorAll("sl-exam-test .sl-embed-status")].some((s) => s.textContent === "Loading…"), {
      timeout: 10000,
    });
    const tests = await teacher.page.evaluate(() => [...document.querySelectorAll("sl-exam-test")].map((el) => el.textContent.trim()));
    assert.deepEqual(tests, ["This record does not exist.", "This record does not exist."], "a test block naming no test says so in its own area");
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
    assert.deepEqual(
      await teacher.page.evaluate(() => {
        const cell = [...document.querySelectorAll(".sl-exam-sheet .sl-exam-category")].find((th) => th.textContent.startsWith("Online tests ("));
        return cell ? [...document.querySelectorAll(".sl-exam-sheet .sl-exam-column-head")].map((th) => th.textContent).filter((text) => text === "no tests yet").length : null;
      }),
      1,
      "online tests keep their heading with the weight before any test is written"
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
    assert.deepEqual(seen.leading, ["Student", "Winter", "Calculated Proposal", "Teacher Override", "Actual Grade"]);
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

  test("the buttons to the pool and the online tests are on every teacher page and keep what the bar has chosen", async () => {
    for (const reference of [
      "/exam/",
      `/exam/classes/${gbClass.id}`,
      `/exam/courses/${course.id}`,
      `/exam/courses/${course.id}/gradebook`,
      "/exam/scale",
      "/exam/pool",
      "/exam/tests",
    ]) {
      const served = await html(teacher, reference);
      assert.match(served, /class="sl-exam-bar-page" data-page="pool"/, `${reference} carries the pool's button`);
      assert.match(served, /class="sl-exam-bar-page" data-page="tests"/, `${reference} carries the tests' button`);
    }

    const buttons = () =>
      teacher.page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll(".sl-exam-bar-page")].map((a) => [a.dataset.page, { href: a.getAttribute("href"), current: a.getAttribute("aria-current") }])
        )
      );
    await open("/exam/");
    assert.deepEqual(await buttons(), {
      pool: { href: `/exam/pool?year=${year.id}`, current: null },
      tests: { href: `/exam/tests?year=${year.id}`, current: null },
    });

    await open(`/exam/courses/${course.id}/gradebook?semester=ws`);
    assert.deepEqual(await buttons(), {
      pool: { href: `/exam/pool?course=${course.id}`, current: null },
      tests: { href: `/exam/tests?course=${course.id}`, current: null },
    });
    const chosen = async () => {
      const seen = await bar(teacher.page);
      return [seen.year.chosen, seen.class.chosen, seen.course.chosen];
    };
    const expected = [`${year.name} (current)`, "9XGB", "GB"];

    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click('.sl-exam-bar-page[data-page="pool"]')]);
    await teacher.page.waitForSelector(".sl-exam-bar");
    assert.equal(new URL(teacher.page.url()).pathname, "/exam/pool");
    assert.deepEqual(await chosen(), expected, "the pool's bar keeps year, class and course");
    assert.equal((await buttons()).pool.current, "page", "the pool's button is marked");

    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click('.sl-exam-bar-page[data-page="tests"]')]);
    await teacher.page.waitForSelector(".sl-exam-bar");
    assert.equal(new URL(teacher.page.url()).pathname, "/exam/tests");
    assert.deepEqual(await chosen(), expected, "the tests' bar keeps year, class and course");
    assert.deepEqual(Object.values(await buttons()).map((b) => b.current), [null, "page"], "the tests' button is marked");
    await teacher.page.waitForSelector(`.sl-exam-tests-course[data-course="${course.id}"]`, { timeout: 20000 });

    // Choosing another class on the tests page stays there; with no course
    // chosen the year's courses are listed, grouped by class and course.
    await Promise.all([
      teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      teacher.page.select('.sl-exam-bar select[data-position="course"]', ""),
    ]);
    assert.equal(new URL(teacher.page.url()).pathname, "/exam/tests");
    await teacher.page.waitForSelector(".sl-exam-tests-course h2", { timeout: 20000 });
    const groups = await teacher.page.evaluate(() => [...document.querySelectorAll(".sl-exam-tests-course h2")].map((h2) => h2.textContent));
    assert.ok(groups.includes("9XGB GB"), `the year's courses are listed: ${groups.join(", ")}`);
    assert.deepEqual((await chosen()).slice(0, 2), expected.slice(0, 2), "the class stays chosen");
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
    for (const reference of ["/exam/pool", "/exam/tests", `/exam/tests?course=${course.id}`]) {
      assert.doesNotMatch(await html(student, reference), /sl-exam-bar/, `${reference} for a student`);
    }
    assert.equal((await fetchAs(student, "/exam/api/tests")).status, 403, "the tests' list refuses a student");
    await setPreferences(teacher, { vt: 0 });
    try {
      for (const reference of ["/exam/", `/exam/courses/${course.id}/gradebook`, "/exam/pool", `/exam/tests?course=${course.id}`]) {
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

describe("online tests: assembly", () => {
  let student;
  let teacher;
  let course;
  let questions;

  /** The 9XGB course of the gradebook's checks, and the pool the pool's checks imported. */
  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    questions = (await fetchAs(teacher, "/exam/api/pool/questions")).json;
    assert.equal(questions.length, 2, "the pool's checks imported two questions");
  });

  test("without a course in the bar the browser offers no way to create a test", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/pool`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-pool-questions tbody tr", { timeout: 20000 });
    const [first] = await teacher.page.$$(".sl-exam-pool-questions tbody tr");
    await first.click();
    await teacher.page.waitForSelector(".sl-exam-pool-question", { timeout: 10000 });
    const seen = await teacher.page.evaluate(() => ({
      chosen: document.querySelectorAll(".sl-exam-pool-questions tr.is-chosen, .sl-exam-pool-questions tr[aria-selected]").length,
      assembly: Boolean(document.querySelector(".sl-exam-pool-assembly")),
    }));
    assert.deepEqual(seen, { chosen: 0, assembly: false }, "a click shows the preview and chooses nothing");
  });

  test("with a course in the bar, ticked questions become a test with their usage shown in the browser", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/pool?course=${course.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-pool-questions tbody tr", { timeout: 20000 });
    assert.match(await teacher.page.$eval(".sl-exam-pool-assembly h2", (el) => el.textContent), /9XGB GB/);
    assert.equal(await teacher.page.$$eval(".sl-exam-pool-questions input[type=checkbox]", (inputs) => inputs.length), 0, "no tick boxes");
    const chosen = () => teacher.page.$$eval(".sl-exam-pool-questions tr.is-chosen", (rows) => rows.map((row) => Number(row.dataset.question)));
    // A click anywhere on a row chooses it, a second one unchooses it.
    await teacher.page.click(`tr[data-question="${questions[0].id}"] td:nth-child(2)`);
    assert.deepEqual(await chosen(), [questions[0].id]);
    await teacher.page.click(`tr[data-question="${questions[0].id}"] td:nth-child(3)`);
    assert.deepEqual(await chosen(), [], "unchosen again");
    await teacher.page.waitForSelector(".sl-exam-pool-question", { timeout: 10000 });
    for (const question of questions) await teacher.page.click(`tr[data-question="${question.id}"] td:nth-child(1) .sl-exam-pool-kind`);
    assert.deepEqual((await chosen()).sort(), questions.map((q) => q.id).sort());
    assert.match(await teacher.page.$eval(".sl-exam-pool-count", (el) => el.textContent), /2 questions chosen/);
    await teacher.page.type(".sl-exam-pool-create input[name=name]", "HTTP basics");
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click(".sl-exam-pool-create button[type=submit]")]);
    const testId = Number(new URL(teacher.page.url()).pathname.split("/").pop());
    assert.ok(testId > 0, `the test's page opened: ${teacher.page.url()}`);
    await teacher.page.waitForSelector(".sl-exam-test-questions li", { timeout: 20000 });
    const page = await teacher.page.evaluate(() => ({
      heading: document.querySelector("#markdown-content h1")?.textContent,
      current: document.querySelector(".sl-exam-bar-page[aria-current]")?.dataset.page,
      course: document.querySelector('.sl-exam-bar select[data-position="course"]').selectedOptions[0].textContent,
      questions: document.querySelectorAll(".sl-exam-test-questions > li").length,
      correct: document.querySelectorAll(".sl-exam-test-questions .is-correct").length,
    }));
    assert.deepEqual(page, { heading: "HTTP basics", current: "tests", course: "GB", questions: 2, correct: 2 });

    const shown = (await fetchAs(teacher, `/exam/api/pool/questions/${questions[0].id}`)).json;
    assert.deepEqual(shown.usage.map((u) => [u.testId, u.subject, u.className]), [[testId, "GB", "9xgb"]]);
    await teacher.page.goto(`${applicationUrl}/exam/pool?course=${course.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(`tr[data-question="${questions[0].id}"]`, { timeout: 20000 });
    assert.equal(await teacher.page.$eval(`tr[data-question="${questions[0].id}"] td:nth-child(2)`, (td) => td.textContent), "1×", "the browser shows the usage");

    const listed = (await fetchAs(teacher, `/exam/api/tests?course=${course.id}`)).json.groups[0].tests;
    assert.deepEqual(listed.map((t) => [t.id, t.name, t.questions]), [[testId, "HTTP basics", 2]]);
    await fetchAs(teacher, `/exam/api/tests/${testId}`, { method: "DELETE" });
  });

  test("no student, and no teacher in student view, reaches a test", async () => {
    const created = await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Probe", questionIds: [questions[0].id] } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    const id = created.json.id;
    const probe = async (session) => {
      const nothing = await fetchAs(session, absent);
      for (const [method, reference, body] of [
        ["GET", "/exam/api/tests"],
        ["GET", `/exam/api/tests?course=${course.id}`],
        ["GET", `/exam/api/tests/${id}`],
        ["PUT", `/exam/api/tests/${id}`, { name: "Stolen" }],
        ["DELETE", `/exam/api/tests/${id}`],
        ["POST", `/exam/api/courses/${course.id}/tests`, { name: "Mine", questionIds: [questions[0].id] }],
      ]) {
        assert.equal((await fetchAs(session, reference, { method, body })).status, 403, `${method} ${reference} is refused`);
      }
      for (const reference of ["/exam/tests", `/exam/tests/${id}`]) {
        assert.deepEqual(await fetchAs(session, reference), nothing, `${reference} is not there`);
      }
    };
    try {
      await probe(student);
      await setPreferences(teacher, { vt: 0 });
      await probe(teacher);
    } finally {
      await setPreferences(teacher, {});
    }
    const after = (await fetchAs(teacher, `/exam/api/tests/${id}`)).json;
    assert.equal(after.name, "Probe", "nothing was changed");
    await fetchAs(teacher, `/exam/api/tests/${id}`, { method: "DELETE" });
  });

  test("a test somebody has started cannot be deleted, and its questions cannot change", async () => {
    const created = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Started", questionIds: [questions[0].id] } })).json;
    // An attempt as the writing will start one, written beside the instance.
    const { db } = openDatabase(run.databasePath);
    try {
      const at = new Date().toISOString();
      const sitting = db
        .prepare("INSERT INTO sitting (test_id, opens_at, closes_at, duration_s, created_at) VALUES (?, ?, ?, 600, ?)")
        .run(created.id, at, new Date(Date.now() + 3600000).toISOString(), at);
      db.prepare("INSERT OR IGNORE INTO student (username) VALUES ('probe-student')").run();
      db.prepare("INSERT INTO attempt (test_id, sitting_id, username, started_at, deadline, question_count) VALUES (?, ?, 'probe-student', ?, ?, 1)").run(
        created.id,
        Number(sitting.lastInsertRowid),
        at,
        at
      );
    } finally {
      db.close();
    }
    const refused = await fetchAs(teacher, `/exam/api/tests/${created.id}`, { method: "DELETE" });
    assert.equal(refused.status, 409);
    assert.match(refused.json.error, /written/);
    assert.equal((await fetchAs(teacher, `/exam/api/tests/${created.id}`, { method: "PUT", body: { questionIds: [questions[1].id] } })).status, 409);
    const kept = (await fetchAs(teacher, `/exam/api/tests/${created.id}`)).json;
    assert.deepEqual([kept.started, kept.questions.map((q) => q.questionId)], [true, [questions[0].id]]);
    assert.equal((await fetchAs(teacher, `/exam/api/tests/${created.id}`, { method: "PUT", body: { name: "Renamed" } })).json.name, "Renamed", "renaming stays possible");
  });
});

describe("online tests: writing", () => {
  let student;
  let teacher;
  let course;
  let questions;
  let imageId;

  /** A connection to the run's database beside the instance, for what only the server knows. */
  function database(fn) {
    const { db } = openDatabase(run.databasePath);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  /** A test of both pool questions with a sitting open from a minute ago for 50 minutes. */
  async function openTest(name) {
    const created = await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name, questionIds: questions.map((q) => q.id) } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    const sitting = await fetchAs(teacher, `/exam/api/tests/${created.json.id}/sittings`, {
      method: "POST",
      body: { opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 50 * 60000).toISOString(), durationMinutes: 15 },
    });
    assert.equal(sitting.status, 200, JSON.stringify(sitting.json));
    return { ...created.json, sitting: sitting.json };
  }

  /** The answer texts the teacher's page marks correct, per question name. */
  async function correctTexts(testId) {
    const test = (await fetchAs(teacher, `/exam/api/tests/${testId}`)).json;
    return test.questions.map((q) => q.answers.filter((a) => a.correct).map((a) => a.textDe.replace(/<[^>]+>/g, "").trim()));
  }

  /** Clicks the answer whose text is `text` on the writing page, and waits for its save. */
  async function choose(page, text) {
    const clicked = await page.evaluate((wanted) => {
      const label = [...document.querySelectorAll(".sl-exam-attempt-answers label")].find((l) => l.textContent.trim() === wanted);
      if (!label) return false;
      label.querySelector("input").click();
      return label.closest("fieldset").dataset.n;
    }, text);
    assert.ok(clicked, `the answer "${text}" is on the page`);
    await page.waitForFunction((n) => document.querySelector(`fieldset[data-n="${n}"] .sl-exam-attempt-state`).dataset.state === "saved", { timeout: 10000 }, clicked);
  }

  /** An image request from inside the page: its status only. */
  const imageStatus = (session) =>
    session.page.evaluate(async (address) => (await fetch(address, { credentials: "include" })).status, `${applicationUrl}/exam/api/images/${imageId}`);

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    questions = (await fetchAs(teacher, "/exam/api/pool/questions")).json;
    imageId = database((db) => db.prepare("SELECT id FROM image").get().id);
  });

  test("a student writes a test: shuffled tokens only, saved at once, resumed on reload, focus counted, submitted with points and grade only", async () => {
    const test = await openTest("Writing");
    const correct = await correctTexts(test.id);
    const page = student.page;
    const bodies = [];
    const collect = (response) => {
      if (new URL(response.url()).pathname.startsWith("/exam/api/") && (response.headers()["content-type"] ?? "").includes("json")) {
        bodies.push(response.text().catch(() => ""));
      }
    };
    page.on("response", collect);
    try {
      await page.goto(`${applicationUrl}/exam/my/tests`, { waitUntil: "domcontentloaded" });
      assert.equal(await page.$(".sl-exam-bar"), null, "no bar on the student's page");
      await page.waitForSelector(`.sl-exam-attempt-open[data-test="${test.id}"] button`, { timeout: 20000 });
      await page.click(`.sl-exam-attempt-open[data-test="${test.id}"] button`);
      await page.waitForSelector(".sl-exam-attempt-question", { timeout: 20000 });
      await page.waitForFunction(() => [...document.querySelectorAll(".sl-exam-writing img")].every((img) => img.complete && img.naturalWidth === 1), { timeout: 10000 });
      assert.equal(await imageStatus(student), 200, "the image of an open attempt is served");

      await choose(page, correct[0][0]);
      const before = await page.$eval(".sl-exam-countdown", (el) => el.textContent);
      assert.match(before, /^1[45]:\d\d$/, `the countdown runs from the server's 15 minutes: ${before}`);

      // Leaving the page and coming back, twice.
      for (let i = 0; i < 2; i += 1) {
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await new Promise((resolve) => setTimeout(resolve, 300));
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".sl-exam-attempt-question", { timeout: 20000 });
      const resumed = await page.evaluate(() => [...document.querySelectorAll(".sl-exam-attempt-answers input:checked")].map((input) => input.closest("label").textContent.trim()));
      assert.deepEqual(resumed, [correct[0][0]], "the reload resumes with the saved answer");
      assert.match(await page.$eval(".sl-exam-countdown", (el) => el.textContent), /^1[45]:\d\d$/, "and the time left");

      await choose(page, correct[1][0]);
      await page.click(".sl-exam-attempt-submit");
      assert.match(await page.$eval(".sl-exam-attempt-submit", (el) => el.textContent), /Wirklich abgeben/, "submitting asks once more");
      await page.click(".sl-exam-attempt-submit");
      await page.waitForSelector(".sl-exam-attempt-result", { timeout: 10000 });
      const result = await page.$eval(".sl-exam-attempt-result", (el) => el.textContent);
      assert.match(result, /2 of 2 questions correct – grade 1/);
      assert.equal(await page.$(".sl-exam-attempt-result input, .sl-exam-attempt-result .is-correct"), null, "nothing about the answers");
    } finally {
      page.off("response", collect);
    }

    const forbidden = new Set(["correct", "position", "questionId", "id", "testQuestionId", "testAnswerId"]);
    const keys = (value, found = new Set()) => {
      if (Array.isArray(value)) value.forEach((item) => keys(item, found));
      else if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) found.add(key) && keys(inner, found);
      return found;
    };
    const texts = await Promise.all(bodies);
    assert.ok(texts.length >= 5, `the writing session's answers were seen: ${texts.length}`);
    for (const text of texts) {
      const leaked = [...keys(JSON.parse(text || "null"))].filter((key) => forbidden.has(key));
      assert.deepEqual(leaked, [], `a response of the writing session carries ${leaked.join(", ")}: ${text.slice(0, 200)}`);
    }

    const attempt = database((db) => db.prepare("SELECT * FROM attempt WHERE test_id = ?").get(test.id));
    assert.deepEqual([attempt.score, attempt.question_count], [2, 2], "the grade is the answers', whatever the focus log says");
    assert.ok(attempt.focus_count >= 2, `the focus losses are counted: ${attempt.focus_count}`);

    // After submission: nothing more to read.
    assert.equal(await imageStatus(student), 403, "the image is refused after submission");
    const again = await fetchAs(student, `/exam/api/attempts/${attempt.id}`);
    assert.deepEqual(Object.keys(again.json).sort(), ["grade", "questionCount", "score", "submitted"]);
    assert.equal((await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).status, 409, "no second attempt");
    assert.deepEqual((await fetchAs(student, "/exam/api/my/tests")).json.tests.filter((t) => t.testId === test.id), [], "the test is hidden");
  });

  test("a teacher tries a test in a window of its own, and nothing is saved, submitted or graded", async () => {
    const test = await openTest("Preview");
    await teacher.page.goto(`${applicationUrl}/exam/tests/${test.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-test-preview", { timeout: 20000 });
    assert.deepEqual(
      await teacher.page.$eval(".sl-exam-test-preview", (a) => [a.getAttribute("href"), a.getAttribute("target")]),
      [`/exam/tests/${test.id}/preview`, "_blank"],
      "it opens in a new window"
    );
    const writes = [];
    const watch = (request) => {
      if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith("/exam/api/")) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    };
    teacher.page.on("request", watch);
    try {
      await teacher.page.goto(`${applicationUrl}/exam/tests/${test.id}/preview`, { waitUntil: "domcontentloaded" });
      await teacher.page.waitForSelector(".sl-exam-writing[data-preview='1'] .sl-exam-attempt-question", { timeout: 20000 });
      assert.equal(await teacher.page.$(".sl-exam-bar"), null, "as a student sees it, without the bar");
      assert.match(await teacher.page.$eval(".sl-exam-attempt-preview", (el) => el.textContent), /Probeansicht/);
      assert.match(await teacher.page.$eval(".sl-exam-countdown", (el) => el.textContent), /^1[45]:\d\d$/, "the sitting's duration");
      await teacher.page.click(".sl-exam-attempt-answers label");
      await teacher.page.click(".sl-exam-attempt-submit");
      await teacher.page.click(".sl-exam-attempt-submit");
      assert.match(await teacher.page.$eval(".sl-exam-writing .sl-exam-message", (el) => el.textContent), /nichts abgegeben/);
      assert.equal(await teacher.page.$(".sl-exam-attempt-result"), null, "no result");
    } finally {
      teacher.page.off("request", watch);
    }
    assert.deepEqual(writes, [], "the preview wrote nothing");
    const preview = (await fetchAs(teacher, `/exam/api/tests/${test.id}/preview`)).json;
    assert.doesNotMatch(JSON.stringify(preview), /"correct"|"position"|"id"/, "the preview carries no flags either");
    assert.equal(database((db) => db.prepare("SELECT COUNT(*) AS n FROM attempt WHERE test_id = ?").get(test.id).n), 0, "no attempt");
    assert.equal((await fetchAs(student, `/exam/api/tests/${test.id}/preview`)).status, 403, "a student is refused");
    assert.deepEqual(await fetchAs(student, `/exam/tests/${test.id}/preview`), await fetchAs(student, absent), "and finds no page");
  });

  test("a teacher shows a test's solution on the board: correct answers and the class's share, no names, no foreign host", async () => {
    const tests = (await fetchAs(teacher, `/exam/api/tests?course=${course.id}`)).json.groups[0].tests;
    const written = tests.find((t) => t.name === "Writing");
    const unwritten = tests.find((t) => t.name === "Preview");
    await teacher.page.goto(`${applicationUrl}/exam/tests/${written.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-test-solution", { timeout: 20000 });
    assert.deepEqual(
      await teacher.page.$eval(".sl-exam-test-solution", (a) => [a.getAttribute("href"), a.getAttribute("target")]),
      [`/exam/tests/${written.id}/solution`, "_blank"],
      "the test's page opens the solution in a new window"
    );

    const deck = async (testId) => {
      const hosts = new Set();
      const record = (request) => hosts.add(new URL(request.url()).host);
      teacher.page.on("request", record);
      try {
        await teacher.page.goto(`${applicationUrl}/exam/tests/${testId}/solution`, { waitUntil: "networkidle0" });
        await teacher.page.waitForFunction(() => document.body.style.display !== "none", { timeout: 10000 });
        const seen = await teacher.page.evaluate(() => ({
          html: document.documentElement.outerHTML,
          revealed: Boolean(document.querySelector(".reveal.ready, .reveal .slides section.present")),
          questions: [...document.querySelectorAll("section.sl-board-question")].map((s) => ({
            correct: s.querySelectorAll(".sl-board-correct").length,
            share: s.querySelector(".sl-board-share")?.textContent ?? null,
          })),
        }));
        return { ...seen, hosts: [...hosts] };
      } finally {
        teacher.page.off("request", record);
      }
    };

    const flags = (await fetchAs(teacher, `/exam/api/tests/${written.id}`)).json.questions.map((q) => q.answers.filter((a) => a.correct).length);
    const solved = await deck(written.id);
    assert.ok(solved.revealed, "the deck runs in the presentation view");
    assert.deepEqual(
      solved.questions,
      flags.map((correct) => ({ correct, share: "Richtig beantwortet: 100 %" })),
      "one slide per question, its correct answers marked and the share of the one submitted attempt"
    );
    assert.deepEqual(solved.hosts, [new URL(applicationUrl).host], `the deck contacts no other host: ${solved.hosts.join(", ")}`);
    const names = database((db) => db.prepare("SELECT username, given_name, family_name FROM student").all())
      .flatMap((s) => [s.username, s.given_name, s.family_name])
      .filter((value) => typeof value === "string" && value.length > 2);
    assert.ok(names.length > 0);
    assert.deepEqual(names.filter((name) => solved.html.toLowerCase().includes(name.toLowerCase())), [], "no student is named in the deck");

    const fresh = await deck(unwritten.id);
    assert.ok(fresh.questions.length > 0 && fresh.questions.every((q) => q.correct > 0 && q.share === null), "a test nobody wrote shows the answers and no share");

    assert.deepEqual(await fetchAs(student, `/exam/tests/${written.id}/solution`), await fetchAs(student, absent), "a student finds no deck");
    await setPreferences(teacher, { vt: 0 });
    try {
      assert.deepEqual(await fetchAs(teacher, `/exam/tests/${written.id}/solution`), await fetchAs(teacher, absent), "nor does a teacher in student view");
    } finally {
      await setPreferences(teacher, {});
    }
  });

  test("a submitted attempt is a read-only field of its test's column in the sheet, and counts in the proposal", async () => {
    const tests = (await fetchAs(teacher, `/exam/api/tests?course=${course.id}`)).json.groups[0].tests;
    const written = tests.find((t) => t.name === "Writing");
    const username = student.username.toLowerCase();
    const overview = (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=ws`)).json;
    const column = overview.columns.find((c) => c.id === `test-${written.id}`);
    assert.deepEqual([column.category, column.readOnly, column.maxPoints, column.name], ["onlineTests", true, 2, "Writing"]);
    const row = overview.students.find((r) => r.username === username);
    assert.deepEqual(row.results[column.id], { value: 1, points: 2 });
    assert.ok(row.categories.onlineTests, "the online tests count in the proposal");
    assert.equal(overview.students.find((r) => r.username === "gb-other-student").results[column.id], undefined, "nobody else has a result");

    const own = (await fetchAs(student, "/exam/api/my/results")).json.courses.find((c) => c.subject === "GB");
    assert.ok(own.entries.some((e) => e.name === "Writing" && e.points === 2 && e.maxPoints === 2), "the student's own results show the test by name");

    await teacher.page.goto(`${applicationUrl}/exam/courses/${course.id}/gradebook?semester=ws`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-sheet", { timeout: 20000 });
    const cell = await teacher.page.$eval(`td.sl-exam-online-result[data-column="${column.id}"][data-student="${username}"]`, (td) => ({
      text: td.textContent,
      fields: td.querySelectorAll("input, select, textarea").length,
    }));
    assert.deepEqual(cell, { text: "2/2", fields: 0 }, "shown, and nothing to type into");
    const head = await teacher.page.$eval(`th[data-column="${column.id}"]`, (th) => ({ link: th.querySelector("a")?.getAttribute("href"), delete: Boolean(th.querySelector(".sl-exam-delete")) }));
    assert.deepEqual(head, { link: `/exam/tests/${written.id}`, delete: false });

    // The arrow keys pass over the online columns: they are the sheet's first,
    // so left from the first manual field stays there, and right goes on.
    const fields = await teacher.page.$$eval(`input.sl-exam-cell[data-student="${username}"]`, (inputs) => inputs.map((input) => Number(input.dataset.col)));
    const online = await teacher.page.$$eval("th.sl-exam-column-online", (ths) => ths.length);
    assert.ok(online >= 1 && fields.length >= 2, `online columns ${online}, fields ${fields.join(",")}`);
    assert.equal(Math.min(...fields), online, "the first field is the first manual column");
    const first = `input.sl-exam-cell[data-student="${username}"][data-col="${online}"]`;
    await teacher.page.focus(first);
    await teacher.page.evaluate((s) => document.querySelector(s).select(), first);
    await teacher.page.keyboard.press("ArrowLeft");
    assert.equal(await teacher.page.evaluate(() => Number(document.activeElement.dataset.col)), online, "left stays in the first field");
    await teacher.page.keyboard.press("ArrowRight");
    assert.equal(await teacher.page.evaluate(() => Number(document.activeElement.dataset.col)), Math.min(...fields.filter((col) => col > online)));
    await teacher.page.keyboard.press("ArrowLeft");
    await teacher.page.keyboard.press("ArrowLeft");
    assert.equal(await teacher.page.evaluate(() => Number(document.activeElement.dataset.col)), online, "and back, never into an online column");
  });

  test("a second browser is refused and recorded until the teacher releases the attempt", async () => {
    const test = await openTest("Device");
    const started = await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" });
    assert.equal(started.status, 200);
    const attemptId = started.json.attempt;
    const cookieName = `sl-attempt-${attemptId}`;
    const cookie = (await student.context.cookies()).find((c) => c.name === cookieName);
    assert.ok(cookie, "the browser holds the attempt's cookie");
    assert.deepEqual([cookie.httpOnly, cookie.sameSite, cookie.path], [true, "Strict", "/exam/"]);

    // Another browser of the same account: the session without the cookie.
    await student.context.deleteCookie(cookie);
    const refused = await fetchAs(student, `/exam/api/attempts/${attemptId}`);
    assert.equal(refused.status, 409);
    assert.match(refused.json.error, /another browser/);
    assert.equal(database((db) => db.prepare("SELECT COUNT(*) AS n FROM refused_device WHERE attempt_id = ?").get(attemptId).n), 1, "the refusal is recorded");

    assert.equal((await fetchAs(student, `/exam/api/attempts/${attemptId}/release`, { method: "POST" })).status, 403, "a student cannot release");
    assert.equal((await fetchAs(teacher, `/exam/api/attempts/${attemptId}/release`, { method: "POST" })).status, 200);
    const resumed = await fetchAs(student, `/exam/api/attempts/${attemptId}`);
    assert.equal(resumed.status, 200, "the released attempt resumes on the new browser");
    assert.ok(resumed.json.remainingMs > 0 && resumed.json.questions.length === 2);
    assert.ok((await student.context.cookies()).some((c) => c.name === cookieName && c.value !== cookie.value), "bound to the new browser");
    await fetchAs(student, `/exam/api/attempts/${attemptId}/submit`, { method: "POST" });
  });

  test("a write after the deadline is refused, and the attempt is submitted with what was saved", async () => {
    const test = await openTest("Late");
    const writing = (await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).json;
    const first = writing.questions[0];
    assert.equal((await fetchAs(student, `/exam/api/attempts/${writing.attempt}/questions/${first.n}`, { method: "PUT", body: { tokens: [first.answers[0].token] } })).status, 200);
    database((db) => db.prepare("UPDATE attempt SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), writing.attempt));
    const late = await fetchAs(student, `/exam/api/attempts/${writing.attempt}/questions/${first.n}`, { method: "PUT", body: { tokens: [first.answers[1].token] } });
    assert.equal(late.status, 409, "the late write is refused");
    const row = database((db) => db.prepare("SELECT * FROM attempt WHERE id = ?").get(writing.attempt));
    assert.ok(row.submitted_at, "submitted");
    const chosen = database((db) => db.prepare("SELECT COUNT(*) AS n FROM response WHERE attempt_id = ?").get(writing.attempt).n);
    assert.equal(chosen, 1, "with the answer saved before the deadline, unchanged");
  });

  test("at the deadline an attempt whose page is closed is submitted by the server", async () => {
    const test = await openTest("Closed");
    const writing = (await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).json;
    const first = writing.questions[0];
    await fetchAs(student, `/exam/api/attempts/${writing.attempt}/questions/${first.n}`, { method: "PUT", body: { tokens: [first.answers[0].token] } });
    await student.page.goto(`${applicationUrl}${plainPage}`, { waitUntil: "domcontentloaded" });
    database((db) => db.prepare("UPDATE attempt SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), writing.attempt));
    const until = Date.now() + 45000;
    let row;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      row = database((db) => db.prepare("SELECT * FROM attempt WHERE id = ?").get(writing.attempt));
    } while (!row.submitted_at && Date.now() < until);
    assert.ok(row.submitted_at, "the sweep submitted it within 45 s");
    assert.equal(row.submitted_at, row.deadline, "at its deadline");
    assert.equal(database((db) => db.prepare("SELECT COUNT(*) AS n FROM response WHERE attempt_id = ?").get(writing.attempt).n), 1);
  });

  test("no student reaches another student's attempt, and a teacher cannot write a test", async () => {
    const test = await openTest("Others");
    const foreign = database((db) => {
      const sitting = db.prepare("SELECT id FROM sitting WHERE test_id = ?").get(test.id).id;
      const at = new Date().toISOString();
      return Number(
        db
          .prepare("INSERT INTO attempt (test_id, sitting_id, username, started_at, deadline, question_count, device_hash) VALUES (?, ?, 'gb-other-student', ?, ?, 2, 'x')")
          .run(test.id, sitting, at, new Date(Date.now() + 600000).toISOString()).lastInsertRowid
      );
    });
    for (const [method, reference, body] of [
      ["GET", `/exam/api/attempts/${foreign}`],
      ["PUT", `/exam/api/attempts/${foreign}/questions/1`, { tokens: [] }],
      ["POST", `/exam/api/attempts/${foreign}/submit`],
      ["POST", `/exam/api/attempts/${foreign}/focus`, { state: "away" }],
    ]) {
      assert.equal((await fetchAs(student, reference, { method, body })).status, 404, `${method} ${reference}: somebody else's attempt does not exist`);
    }
    assert.equal((await fetchAs(teacher, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).status, 403, "a teacher is refused");
    assert.deepEqual((await fetchAs(teacher, "/exam/api/my/tests")).json.tests, [], "and has no open test");
    await setPreferences(teacher, { vt: 0 });
    try {
      assert.equal((await fetchAs(teacher, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).status, 404, "in student view, on no roster");
    } finally {
      await setPreferences(teacher, {});
    }
  });
});

describe("online tests: the live view", () => {
  let student;
  let teacher;
  let course;
  let questions;
  let written;
  let sitting;

  /** The live view's row of the shared student, as the page shows it. */
  const studentRow = () =>
    teacher.page.evaluate((username) => {
      const row = document.querySelector(`sl-exam-live tr[data-username="${username}"]`);
      return row ? { status: row.dataset.status, focus: row.querySelector(".sl-exam-live-focus").textContent } : null;
    }, student.username.toLowerCase());

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    questions = (await fetchAs(teacher, "/exam/api/pool/questions")).json;
  });

  /** A test with a sitting open now, its live view open on the teacher's page. */
  async function openLive(name) {
    written = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name, questionIds: questions.map((q) => q.id) } })).json;
    sitting = (
      await fetchAs(teacher, `/exam/api/tests/${written.id}/sittings`, {
        method: "POST",
        body: { opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 50 * 60000).toISOString(), durationMinutes: 15 },
      })
    ).json;
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/live`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "stream", { timeout: 20000 });
    assert.deepEqual(await studentRow(), { status: "not started", focus: "–" });
  }

  test("the stream refuses a request without a session and a student's, and sends them nothing", async () => {
    await openLive("Live refusals");
    const anonymous = await fetch(`${applicationUrl}/exam/api/sittings/${sitting.id}/events`, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    assert.notEqual(anonymous.status, 200);
    assert.doesNotMatch(anonymous.headers.get("content-type") ?? "", /event-stream/);
    const asStudent = await student.page.evaluate(async (address) => {
      const response = await fetch(address, { credentials: "include" });
      return { status: response.status, type: response.headers.get("content-type") };
    }, `${applicationUrl}/exam/api/sittings/${sitting.id}/events`);
    assert.equal(asStudent.status, 403);
    assert.doesNotMatch(asStudent.type ?? "", /event-stream/);
    for (const reference of [`/exam/api/sittings/${sitting.id}/live`]) assert.equal((await fetchAs(student, reference)).status, 403);
    assert.deepEqual(await fetchAs(student, `/exam/sittings/${sitting.id}/live`), await fetchAs(student, absent), "the page is not there");
  });

  test("a start, a focus loss and a submission reach the teacher at once, and the hot-reload channel carries none of it", async () => {
    await openLive("Live changes");
    // Listening on the unauthenticated hot-reload channel, as anybody can.
    const controller = new AbortController();
    const heard = [];
    const listening = fetch(`${applicationUrl}/hot-reload`, { signal: controller.signal })
      .then(async (response) => {
        const reader = response.body.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          heard.push(Buffer.from(value).toString("utf8"));
        }
      })
      .catch(() => {});
    try {
      const writing = (await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" })).json;
      await teacher.page.waitForFunction((u) => document.querySelector(`sl-exam-live tr[data-username="${u}"]`)?.dataset.status === "writing", { timeout: 5000 }, student.username.toLowerCase());
      await fetchAs(student, `/exam/api/attempts/${writing.attempt}/focus`, { method: "POST", body: { state: "away" } });
      await fetchAs(student, `/exam/api/attempts/${writing.attempt}/focus`, { method: "POST", body: { state: "back" } });
      await teacher.page.waitForFunction((u) => /left 1×/.test(document.querySelector(`sl-exam-live tr[data-username="${u}"] .sl-exam-live-focus`)?.textContent), { timeout: 5000 }, student.username.toLowerCase());
      await fetchAs(student, `/exam/api/attempts/${writing.attempt}/submit`, { method: "POST" });
      await teacher.page.waitForFunction((u) => document.querySelector(`sl-exam-live tr[data-username="${u}"]`)?.dataset.status === "submitted", { timeout: 5000 }, student.username.toLowerCase());
      assert.equal(await teacher.page.evaluate(() => document.querySelector("sl-exam-live").dataset.mode), "stream", "pushed, not polled");
    } finally {
      controller.abort();
      await listening;
    }
    const channel = heard.join("");
    for (const trace of [student.username.toLowerCase(), "Live changes", "submitted", "writing", "attempt", "sitting"]) {
      assert.ok(!channel.includes(trace), `the hot-reload channel carried "${trace}": ${channel.slice(0, 200)}`);
    }
  });

  test("when the stream fails the view keeps updating from snapshots", async () => {
    await openLive("Live fallback");
    await teacher.page.evaluate(() => document.querySelector("sl-exam-live").fallBack());
    assert.equal(await teacher.page.evaluate(() => document.querySelector("sl-exam-live").dataset.mode), "polling");
    await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" });
    await teacher.page.waitForFunction((u) => document.querySelector(`sl-exam-live tr[data-username="${u}"]`)?.dataset.status === "writing", { timeout: 12000 }, student.username.toLowerCase());
    assert.equal(await teacher.page.evaluate(() => document.querySelector("sl-exam-live").dataset.mode), "polling", "updated by a snapshot");
  });

  test("the live view of a sitting can be opened before it opens, and shows the first start as it happens", async () => {
    written = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Live early", questionIds: questions.map((q) => q.id) } })).json;
    sitting = (
      await fetchAs(teacher, `/exam/api/tests/${written.id}/sittings`, {
        method: "POST",
        body: { opensAt: new Date(Date.now() + 10 * 60000).toISOString(), closesAt: new Date(Date.now() + 60 * 60000).toISOString(), durationMinutes: 15 },
      })
    ).json;
    await teacher.page.goto(`${applicationUrl}/exam/tests/${written.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(`li[data-sitting="${sitting.id}"][data-state="scheduled"] a[href="/exam/sittings/${sitting.id}/live"]`, { timeout: 20000 });
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/live`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "stream", { timeout: 20000 });
    const head = await teacher.page.evaluate(() => ({
      badge: document.querySelector(".sl-exam-live-badge").textContent,
      window: document.querySelector(".sl-exam-live-window").textContent,
      clock: document.querySelector(".sl-exam-live-clock").textContent,
      first: document.querySelector("sl-exam-live .sl-exam-live-head") === document.querySelector("sl-exam-live .sl-exam").firstElementChild,
    }));
    assert.equal(head.badge, "Not open yet");
    assert.match(head.window, /opens in (9|10):\d\d$/, head.window);
    assert.match(head.clock, /\d{1,2}:\d\d:\d\d/, "the server's time, in the viewer's time zone");
    assert.ok(head.first, "the state stands at the top");
    assert.deepEqual(await studentRow(), { status: "not started", focus: "–" });
    assert.equal((await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" })).status, 404, "nobody writes before it opens");
    // The sitting opens.
    const { db } = openDatabase(run.databasePath);
    try {
      db.prepare("UPDATE sitting SET opens_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), sitting.id);
    } finally {
      db.close();
    }
    await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" });
    await teacher.page.waitForFunction((u) => document.querySelector(`sl-exam-live tr[data-username="${u}"]`)?.dataset.status === "writing", { timeout: 5000 }, student.username.toLowerCase());
    await teacher.page.waitForFunction(() => document.querySelector(".sl-exam-live-badge").textContent === "Live", { timeout: 3000 });
    assert.match(await teacher.page.$eval(".sl-exam-live-window", (el) => el.textContent), /closes in \d+:\d\d$/);
    const focus = await teacher.page.$eval(`sl-exam-live tr[data-username="${student.username.toLowerCase()}"] .sl-exam-live-focus`, (td) => ({ level: td.dataset.level, share: td.querySelector(".sl-exam-live-share").textContent }));
    assert.deepEqual(focus, { level: "good", share: "100 %" }, "never left: a full green bar");
  });

  test("the view for the class shows state, window, time left and clock, without navigation and without a name", async () => {
    await openLive("Live screen");
    const fromList = async (reference) => {
      await teacher.page.goto(`${applicationUrl}${reference}`, { waitUntil: "domcontentloaded" });
      await teacher.page.waitForSelector(`a.sl-exam-screen-link[href="/exam/sittings/${sitting.id}/screen"]`, { timeout: 20000 });
      return teacher.page.$eval(`a.sl-exam-screen-link[href="/exam/sittings/${sitting.id}/screen"]`, (a) => a.getAttribute("target"));
    };
    assert.equal(await fromList(`/exam/tests?course=${course.id}`), "_blank", "the online tests' list links the class screen in a new window");
    assert.equal(await fromList(`/exam/tests/${written.id}`), "_blank", "and so does the test's page");
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/live`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-live-screen-link", { timeout: 20000 });
    assert.equal(
      await teacher.page.$eval(".sl-exam-live-screen-link", (a) => [a.getAttribute("href"), a.getAttribute("target")].join(" ")),
      `/exam/sittings/${sitting.id}/screen _blank`
    );
    await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" });
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/screen`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "stream", { timeout: 20000 });
    const seen = await teacher.page.evaluate(() => ({
      navigation: Boolean(document.querySelector("#topbar, #sidebar, .sl-exam-bar")),
      list: Boolean(document.querySelector("sl-exam-live table, sl-exam-live button")),
      badge: document.querySelector(".sl-exam-live-badge").textContent,
      label: document.querySelector(".sl-exam-screen-label").textContent,
      remaining: document.querySelector(".sl-exam-screen-remaining").textContent,
      clock: document.querySelector(".sl-exam-screen-clock").textContent,
      summary: document.querySelector(".sl-exam-live-summary").textContent,
      text: document.body.innerText,
      size: parseFloat(getComputedStyle(document.querySelector(".sl-exam-screen-remaining")).fontSize),
    }));
    assert.equal(seen.navigation, false, "no top bar, sidebar or module bar");
    assert.equal(seen.list, false, "no list and nothing to click");
    assert.deepEqual([seen.badge, seen.label], ["Live", "Closes in"]);
    assert.match(seen.remaining, /^\d+:\d\d$/);
    assert.match(seen.clock, /\d{1,2}:\d\d:\d\d/);
    assert.match(seen.summary, /1 writing/);
    assert.ok(!seen.text.toLowerCase().includes(student.username.toLowerCase()), "no name on the screen");
    assert.ok(seen.size >= 64, `the time left is large: ${seen.size}px`);
    assert.deepEqual(await fetchAs(student, `/exam/sittings/${sitting.id}/screen`), await fetchAs(student, absent), "a student finds no page");
  });

  test("a teacher who switches to the student view gets refused, and the view says why", async () => {
    await openLive("Live student view");
    // Switched in another tab, so the live view's page stays open.
    const other = await teacher.context.newPage();
    await other.goto(`${applicationUrl}${plainPage}`, { waitUntil: "domcontentloaded" });
    const elsewhere = { ...teacher, page: other };
    await setPreferences(elsewhere, { vt: 0 });
    try {
      // The next change of the sitting is checked against the session first.
      await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" });
      await teacher.page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "refused", { timeout: 10000 });
      assert.match(await teacher.page.$eval("sl-exam-live .sl-exam-live-state", (el) => el.textContent), /student view is active/);
      assert.equal(await teacher.page.$$eval("sl-exam-live tbody tr", (rows) => rows.length), 0, "nothing of the sitting is left on the page");
    } finally {
      await setPreferences(elsewhere, {});
      await other.close();
    }
  });
});

describe("the question editor", () => {
  let student;
  let teacher;
  let course;
  let categoryId;

  // A 1×1 PNG, and a second, different one.
  const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const otherPixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

  /** A connection to the run's database beside the instance, for what only the server knows. */
  function database(fn) {
    const { db } = openDatabase(run.databasePath);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  /**
   * An upload from inside the page, as the editor sends one: the bytes of
   * `base64`, or `size` bytes starting like a PNG, in a file called `name`.
   */
  async function uploadAs(session, { base64 = null, size = 0, name = "image.png" }) {
    return session.page.evaluate(
      async (address, base64, size, name) => {
        let bytes;
        if (base64 !== null) {
          bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        } else {
          bytes = new Uint8Array(size);
          bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        }
        const response = await fetch(address, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/octet-stream" },
          body: new File([bytes], name, { type: "image/png" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          // Not JSON.
        }
        return { status: response.status, json };
      },
      `${applicationUrl}/exam/api/pool/uploads`,
      base64,
      size,
      name
    );
  }

  /** What an image address answers inside the page: its status and size. */
  const imageAs = (session, reference) =>
    session.page.evaluate(async (address) => {
      const response = await fetch(address, { credentials: "include" });
      return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
    }, `${applicationUrl}${reference}`);

  /** A complete new question in the checks' category; `overrides` change any field. */
  async function newQuestion(overrides = {}) {
    const created = await fetchAs(teacher, "/exam/api/pool/questions", {
      method: "POST",
      body: {
        categoryId,
        type: "multichoice",
        nameDe: "Editor-Frage",
        nameEn: "Editor question",
        textDe: "<p>Was ist richtig?</p>",
        textEn: "<p>What is right?</p>",
        answers: [
          { textDe: "<p>das</p>", textEn: "<p>this</p>", correct: true },
          { textDe: "<p>jenes</p>", textEn: "<p>that</p>", correct: false },
        ],
        ...overrides,
      },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    return created.json.question;
  }

  /** The question as the editor sends it back unchanged. */
  async function editable(id) {
    const q = (await fetchAs(teacher, `/exam/api/pool/questions/${id}`)).json;
    return {
      version: q.version,
      categoryId: q.categoryId,
      type: q.type,
      nameDe: q.nameDe,
      nameEn: q.nameEn,
      textDe: q.textDe,
      textEn: q.textEn,
      answers: q.answers.map(({ textDe, textEn, correct }) => ({ textDe, textEn, correct })),
    };
  }

  /** A test of `questionIds` for the GB course; with `written`, the student has started it. */
  async function testOf(name, questionIds, { written = false } = {}) {
    const created = await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name, questionIds } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    if (written) {
      await fetchAs(teacher, `/exam/api/tests/${created.json.id}/sittings`, {
        method: "POST",
        body: { opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 50 * 60000).toISOString(), durationMinutes: 15 },
      });
      const writing = await fetchAs(student, `/exam/api/tests/${created.json.id}/attempt`, { method: "POST" });
      assert.equal(writing.status, 200, JSON.stringify(writing.json));
      await fetchAs(student, `/exam/api/attempts/${writing.json.attempt}/submit`, { method: "POST" });
    }
    return created.json;
  }

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    const created = await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId: null, nameDe: "Editor-Checks", nameEn: "Editor checks" } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    categoryId = created.json.id;
  });

  test("no student, and no teacher in student view, reaches the editor's pages or changes the pool", async () => {
    const question = await newQuestion();
    const { src } = (await uploadAs(teacher, { base64: pixel })).json;
    const before = await editable(question.id);
    const probe = async (session) => {
      const nothing = await fetchAs(session, absent);
      for (const page of [`/exam/pool/questions/${question.id}`, `/exam/pool/questions/new?category=${categoryId}`, "/exam/pool/categories"]) {
        assert.deepEqual(await fetchAs(session, page), nothing, `${page} is not there`);
      }
      for (const [method, reference, body] of [
        ["POST", "/exam/api/pool/questions", { ...before, nameDe: "x" }],
        ["PUT", `/exam/api/pool/questions/${question.id}`, { ...before, nameDe: "x" }],
        ["POST", `/exam/api/pool/questions/${question.id}/retire`],
        ["DELETE", `/exam/api/pool/questions/${question.id}`],
        ["POST", "/exam/api/pool/categories", { nameDe: "x", nameEn: "x" }],
        ["PUT", `/exam/api/pool/categories/${categoryId}`, { nameDe: "x", nameEn: "x" }],
        ["DELETE", `/exam/api/pool/categories/${categoryId}`],
      ]) {
        assert.equal((await fetchAs(session, reference, { method, body })).status, 403, `${method} ${reference} is refused`);
      }
      assert.equal((await uploadAs(session, { base64: pixel })).status, 403, "the upload is refused");
      assert.equal((await imageAs(session, src.replace(applicationUrl, ""))).status, 403, "a staged upload is not served");
    };
    await probe(student);
    await setPreferences(teacher, { vt: 0 });
    try {
      await probe(teacher);
    } finally {
      await setPreferences(teacher, {});
    }
    assert.deepEqual(await editable(question.id), before, "the question is unchanged");
    assert.equal((await fetchAs(teacher, `/exam/api/pool/categories`)).json.find((c) => c.id === categoryId).nameDe, "Editor-Checks");
  });

  test("a mismatch is refused with the answer named, and nothing is stored", async () => {
    const question = await newQuestion();
    const input = await editable(question.id);
    input.answers[1].textEn = "";
    input.answers[1].correct = true;
    const refused = await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`, { method: "PUT", body: input });
    assert.equal(refused.status, 422);
    assert.deepEqual(
      refused.json.problems.map((p) => [p.field, p.answer, p.message]),
      [
        ["textEn", 2, "Answer 2 has no English text."],
        ["answers", null, "Exactly one answer may be correct in a single-choice question."],
      ]
    );
    assert.equal((await editable(question.id)).answers[1].textEn, "<p>that</p>");
  });

  test("a styled save is stored without style and script", async () => {
    const question = await newQuestion();
    const input = await editable(question.id);
    input.textDe = '<p style="color: red" onclick="alert(1)">Was ist <b>richtig</b>?</p><script>alert(1)</script><img src="x" onerror="alert(1)">';
    const saved = await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`, { method: "PUT", body: input });
    assert.equal(saved.status, 422, "an image from outside the module is refused");
    input.textDe = '<p style="color: red" onclick="alert(1)">Was ist <b>richtig</b>?</p><script>alert(1)</script>';
    const stored = await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`, { method: "PUT", body: input });
    assert.equal(stored.status, 200, JSON.stringify(stored.json));
    assert.equal(stored.json.question.textDe, "<p>Was ist <b>richtig</b>?</p>");
  });

  test("a written test's snapshot is unchanged after an edit; the second of two concurrent saves is refused", async () => {
    const question = await newQuestion();
    const written = await testOf("Editor: written", [question.id], { written: true });
    const snapshot = (await fetchAs(teacher, `/exam/api/tests/${written.id}`)).json.questions;
    const first = await editable(question.id);
    const second = await editable(question.id);
    first.textDe = "<p>Neu formuliert</p>";
    first.answers[0].correct = false;
    first.answers[1].correct = true;
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`, { method: "PUT", body: first })).status, 200);
    assert.deepEqual((await fetchAs(teacher, `/exam/api/tests/${written.id}`)).json.questions, snapshot, "the written test keeps its snapshot");
    second.nameDe = "Zweiter Stand";
    const late = await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`, { method: "PUT", body: second });
    assert.equal(late.status, 409);
    assert.match(late.json.error, /changed in the meantime/);
    const kept = await editable(question.id);
    assert.deepEqual([kept.nameDe, kept.textDe], ["Editor-Frage", "<p>Neu formuliert</p>"], "the first save is kept");
  });

  test("the editor opens from the preview, saves a fix, and returns to the browser with the category chosen", async () => {
    const question = await newQuestion({ nameDe: "Tippfehler-Frage", nameEn: "Typo question" });
    await teacher.page.goto(`${applicationUrl}/exam/pool?category=${categoryId}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(`.sl-exam-pool-questions tr[data-question="${question.id}"]`, { timeout: 20000 });
    assert.equal(await teacher.page.$eval(".sl-exam-pool-category.is-chosen", (el) => el.dataset.category), String(categoryId), "the category is chosen");
    assert.equal(await teacher.page.$eval(".sl-exam-pool-new", (el) => el.hidden), false, "New question is offered");
    await teacher.page.click(`.sl-exam-pool-questions tr[data-question="${question.id}"] button`);
    await teacher.page.waitForSelector(".sl-exam-pool-edit", { timeout: 10000 });
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click(".sl-exam-pool-edit")]);
    await teacher.page.waitForSelector(".sl-exam-editor sl-rich-text .sl-rich-text-area", { timeout: 20000 });
    const shown = await teacher.page.evaluate(() => ({
      heading: document.querySelector("#markdown-content h1")?.textContent,
      current: document.querySelector(".sl-exam-bar-page[aria-current]")?.dataset.page,
      titles: [document.querySelector("input[name=nameDe]").value, document.querySelector("input[name=nameEn]").value],
      texts: [...document.querySelectorAll(".sl-exam-editor-row:not(.sl-exam-editor-answer) sl-rich-text")].map((el) => el.value),
      answers: [...document.querySelectorAll(".sl-exam-editor-answer")].map((row) => [
        row.querySelector("input").checked,
        ...[...row.querySelectorAll("sl-rich-text")].map((el) => el.value),
      ]),
      toolbar: [...document.querySelector("sl-rich-text .sl-rich-text-toolbar").querySelectorAll("button")].map((b) => b.dataset.action),
      answerTools: [...document.querySelectorAll('.sl-exam-editor-answer[data-answer="1"] .sl-exam-editor-label button')].map((b) => b.title),
    }));
    assert.deepEqual(shown, {
      heading: "Edit: Tippfehler-Frage",
      current: "pool",
      titles: ["Tippfehler-Frage", "Typo question"],
      texts: ["<p>Was ist richtig?</p>", "<p>What is right?</p>"],
      answers: [
        [true, "<p>das</p>", "<p>this</p>"],
        [false, "<p>jenes</p>", "<p>that</p>"],
      ],
      toolbar: ["bold", "italic", "code", "codeblock", "ul", "ol", "image"],
      answerTools: ["Remove"],
    });

    // The second answer becomes the correct one, and a third is added.
    await teacher.page.click('.sl-exam-editor-answer[data-answer="2"] input[type=radio]');
    await teacher.page.click(".sl-exam-editor-add");
    await teacher.page.type('.sl-exam-editor-answer[data-answer="3"] .sl-exam-editor-de .sl-rich-text-area', "beides");
    await teacher.page.click(".sl-exam-editor-actions button[type=submit]");
    await teacher.page.waitForSelector(".sl-exam-editor-problems li", { timeout: 10000 });
    const refused = await teacher.page.evaluate(() => ({
      problems: [...document.querySelectorAll(".sl-exam-editor-problems li")].map((li) => li.textContent),
      marked: [...document.querySelectorAll(".is-refused")].map((el) => el.closest("[data-answer]")?.dataset.answer + (el.closest(".sl-exam-editor-en") ? "/en" : "/de")),
    }));
    assert.deepEqual(refused, { problems: ["Answer 3 has no English text."], marked: ["3/en"] }, "the problem is shown at its field");
    await teacher.page.type('.sl-exam-editor-answer[data-answer="3"] .sl-exam-editor-en .sl-rich-text-area', "both");
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click(".sl-exam-editor-actions button[type=submit]")]);
    assert.equal(new URL(teacher.page.url()).search, `?category=${categoryId}`, "back in the browser with the category chosen");
    const saved = await editable(question.id);
    assert.deepEqual(saved.answers.map((a) => [a.textDe, a.textEn, a.correct]), [
      ["<p>das</p>", "<p>this</p>", false],
      ["<p>jenes</p>", "<p>that</p>", true],
      ["beides", "both", false],
    ]);
  });

  test("a new question from the browser: the rich-text field formats, filters a paste and uploads images by paste and button", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/pool?category=${categoryId}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-pool-new:not([hidden])", { timeout: 20000 });
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click(".sl-exam-pool-new")]);
    assert.equal(new URL(teacher.page.url()).pathname, "/exam/pool/questions/new");
    await teacher.page.waitForSelector(".sl-exam-editor sl-rich-text .sl-rich-text-area", { timeout: 20000 });
    assert.equal(await teacher.page.$eval("select[name=categoryId]", (el) => el.value), String(categoryId), "the browser's category is chosen");

    const de = '.sl-exam-editor-row:not(.sl-exam-editor-answer) .sl-exam-editor-de';
    const en = '.sl-exam-editor-row:not(.sl-exam-editor-answer) .sl-exam-editor-en';
    await teacher.page.type("input[name=nameDe]", "Formatiert");
    await teacher.page.type("input[name=nameEn]", "Formatted");
    // Bold and inline code on a selection; a code block on a line of its own.
    await teacher.page.click(`${de} .sl-rich-text-area`);
    await teacher.page.keyboard.type("fett");
    await teacher.page.evaluate((selector) => {
      const area = document.querySelector(`${selector} .sl-rich-text-area`);
      const range = document.createRange();
      range.selectNodeContents(area);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }, de);
    await teacher.page.click(`${de} button[data-action=bold]`);
    await teacher.page.keyboard.press("End");
    await teacher.page.click(`${de} button[data-action=bold]`);
    await teacher.page.keyboard.type(" und ");
    await teacher.page.keyboard.type("x = 1");
    await teacher.page.keyboard.down("Shift");
    for (let i = 0; i < 5; i += 1) await teacher.page.keyboard.press("ArrowLeft");
    await teacher.page.keyboard.up("Shift");
    await teacher.page.click(`${de} button[data-action=code]`);
    const german = await teacher.page.$eval(`${de} sl-rich-text`, (el) => el.value);
    // Chrome keeps the space after the bold word as `&nbsp;`.
    assert.match(german, /^<b>fett<\/b>(?:&nbsp;| )und <code>x = 1<\/code>$/);

    // A paste from a web page keeps words and basic formatting only; a
    // pasted image file goes through the upload.
    await teacher.page.click(`${en} .sl-rich-text-area`);
    await teacher.page.evaluate((selector, pixel) => {
      const area = document.querySelector(`${selector} .sl-rich-text-area`);
      const paste = (fill) => {
        const data = new DataTransfer();
        fill(data);
        area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      };
      paste((data) => data.setData("text/html", '<p style="color:red" class="x" onclick="alert(1)">Pasted <span style="font-weight:bold"><strong>bold</strong></span><script>alert(1)</script></p>'));
      const bytes = Uint8Array.from(atob(pixel), (c) => c.charCodeAt(0));
      paste((data) => data.items.add(new File([bytes], "clip.png", { type: "image/png" })));
    }, en, pixel);
    await teacher.page.waitForFunction((selector) => document.querySelector(`${selector} .sl-rich-text-area img`), { timeout: 10000 }, en);
    const english = await teacher.page.$eval(`${en} sl-rich-text`, (el) => el.value);
    assert.match(english, /^<p>Pasted <strong>bold<\/strong><img src="\/exam\/api\/pool\/uploads\/[0-9a-f]{32}" alt=""><\/p>$/);

    // The image button uploads a chosen file; a PDF is refused under the field.
    const dir = mkdtempSync(path.join(os.tmpdir(), "safelearn-editor-upload-"));
    try {
      writeFileSync(path.join(dir, "button.png"), Buffer.from(otherPixel, "base64"));
      writeFileSync(path.join(dir, "fake.png"), "%PDF-1.7\n");
      const input = await teacher.page.$(`${de} input[type=file]`);
      await teacher.page.click(`${de} .sl-rich-text-area`);
      await input.uploadFile(path.join(dir, "fake.png"));
      await teacher.page.waitForFunction((selector) => /not an image/.test(document.querySelector(`${selector} .sl-rich-text-status`).textContent), { timeout: 10000 }, de);
      await input.uploadFile(path.join(dir, "button.png"));
      await teacher.page.waitForFunction((selector) => document.querySelector(`${selector} .sl-rich-text-area img`), { timeout: 10000 }, de);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const answers = await teacher.page.$$(".sl-exam-editor-answer");
    for (const [index, row] of answers.entries()) {
      await (await row.$(".sl-exam-editor-de .sl-rich-text-area")).type(`Antwort ${index + 1}`);
      await (await row.$(".sl-exam-editor-en .sl-rich-text-area")).type(`Answer ${index + 1}`);
    }
    await (await answers[0].$("input[type=radio]")).click();
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click(".sl-exam-editor-actions button[type=submit]")]);
    const created = (await fetchAs(teacher, `/exam/api/pool/questions?category=${categoryId}&q=Formatiert`)).json;
    assert.equal(created.length, 1);
    const stored = await editable(created[0].id);
    assert.match(stored.textDe, /^<b>fett<\/b>(?:&nbsp;| )und <code>x = 1<\/code><img src="\/exam\/api\/images\/\d+" alt="">$/);
    assert.match(stored.textEn, /^<p>Pasted <strong>bold<\/strong><img src="\/exam\/api\/images\/\d+" alt=""><\/p>$/);
    assert.notEqual(/images\/(\d+)/.exec(stored.textDe)[1], /images\/(\d+)/.exec(stored.textEn)[1], "two different pictures, two images");
    assert.deepEqual(stored.answers.map((a) => [a.textDe, a.textEn, a.correct]), [["Antwort 1", "Answer 1", true], ["Antwort 2", "Answer 2", false]]);
  });

  test("uploads: 20 MB and a renamed PDF refused, an unsaved one gone after the purge", async () => {
    const huge = await uploadAs(teacher, { size: 20 * 1024 * 1024 });
    assert.equal(huge.status, 413);
    assert.match(huge.json.error, /2 MB/);
    const pdf = await uploadAs(teacher, { base64: Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n").toString("base64"), name: "picture.png" });
    assert.equal(pdf.status, 400);
    assert.match(pdf.json.error, /not an image/);
    const staged = await uploadAs(teacher, { base64: pixel });
    assert.equal(staged.status, 200, JSON.stringify(staged.json));
    assert.deepEqual(await imageAs(teacher, staged.json.src), { status: 200, bytes: Buffer.from(pixel, "base64").length });
    // A day passes without a save; the server purges at start and daily with
    // this same function.
    database((db) => {
      db.prepare("UPDATE image_upload SET uploaded_at = ?").run(new Date(Date.now() - 25 * 3600 * 1000).toISOString());
      purgeUploads(db);
    });
    assert.equal((await imageAs(teacher, staged.json.src)).status, 404, "the unsaved upload is gone");
  });

  test("a new question with an uploaded image is shown in the browser and in a test assembled from it", async () => {
    const { src } = (await uploadAs(teacher, { base64: otherPixel })).json;
    const question = await newQuestion({ nameDe: "Bildfrage", nameEn: "Picture question", textDe: `<p>Siehe <img src="${src}" alt=""></p>`, textEn: `<p>See <img src="${src}" alt=""></p>` });
    const [, imageId] = /\/exam\/api\/images\/(\d+)/.exec(question.textDe);
    assert.equal(question.textEn, `<p>See <img src="/exam/api/images/${imageId}" alt=""></p>`, "one image for both languages");
    assert.equal((await imageAs(teacher, src)).status, 404, "the upload became the question's image");

    await teacher.page.goto(`${applicationUrl}/exam/pool?category=${categoryId}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(`.sl-exam-pool-questions tr[data-question="${question.id}"]`, { timeout: 20000 });
    await teacher.page.click(`.sl-exam-pool-questions tr[data-question="${question.id}"] button`);
    await teacher.page.waitForSelector(".sl-exam-pool-text img", { timeout: 10000 });
    await teacher.page.waitForFunction(() => [...document.querySelectorAll(".sl-exam-pool-text img")].every((img) => img.complete && img.naturalWidth === 1), { timeout: 10000 });

    const test = await testOf("Editor: picture", [question.id]);
    await teacher.page.goto(`${applicationUrl}/exam/tests/${test.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-test-questions img", { timeout: 20000 });
    await teacher.page.waitForFunction(() => [...document.querySelectorAll(".sl-exam-test-questions img")].every((img) => img.complete && img.naturalWidth === 1), { timeout: 10000 });
    await fetchAs(teacher, `/exam/api/tests/${test.id}`, { method: "DELETE" });
  });

  test("retire, revive and delete: a used question stays and is only retired, a fresh one goes with its images", async () => {
    const used = await newQuestion({ nameDe: "Benutzt", nameEn: "Used" });
    const test = await testOf("Editor: usage", [used.id]);
    const refused = await fetchAs(teacher, `/exam/api/pool/questions/${used.id}`, { method: "DELETE" });
    assert.equal(refused.status, 409);
    assert.match(refused.json.error, /Retire it instead/);
    const snapshot = (await fetchAs(teacher, `/exam/api/tests/${test.id}`)).json.questions;
    const retired = await fetchAs(teacher, `/exam/api/pool/questions/${used.id}/retire`, { method: "POST" });
    assert.equal(retired.json.retired, true);
    assert.deepEqual(retired.json.usage.map((u) => u.testId), [test.id], "the usage stays");
    assert.deepEqual((await fetchAs(teacher, `/exam/api/tests/${test.id}`)).json.questions, snapshot, "the test stays");
    assert.ok(!(await fetchAs(teacher, `/exam/api/pool/questions?category=${categoryId}`)).json.some((q) => q.id === used.id), "hidden in the browser");
    assert.ok((await fetchAs(teacher, `/exam/api/pool/questions?category=${categoryId}&retired=1`)).json.some((q) => q.id === used.id && q.retired), "listed when asked for");
    const assembled = await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Editor: retired", questionIds: [used.id] } });
    assert.equal(assembled.status, 400);
    assert.match(assembled.json.error, /retired/);
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${used.id}/revive`, { method: "POST" })).json.retired, false);
    const again = await testOf("Editor: revived", [used.id]);
    await fetchAs(teacher, `/exam/api/tests/${again.id}`, { method: "DELETE" });
    await fetchAs(teacher, `/exam/api/tests/${test.id}`, { method: "DELETE" });

    const { src } = (await uploadAs(teacher, { base64: pixel })).json;
    const fresh = await newQuestion({ nameDe: "Frisch", nameEn: "Fresh", textDe: `<p><img src="${src}"></p>` });
    const [, imageId] = /\/exam\/api\/images\/(\d+)/.exec(fresh.textDe);
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${fresh.id}`, { method: "DELETE" })).status, 200);
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${fresh.id}`)).status, 404);
    assert.equal((await imageAs(teacher, `/exam/api/images/${imageId}`)).status, 404, "its image is gone");
    assert.equal(database((db) => db.prepare("SELECT COUNT(*) AS n FROM answer WHERE question_id = ?").get(fresh.id).n), 0, "and its answers");
  });

  test("categories: a non-empty one is not deleted, none moves into its own subtree, a moved question keeps its usage", async () => {
    const parent = (await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId: categoryId, nameDe: "HTTP und REST", nameEn: "HTTP and REST" } })).json;
    const child = (await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId: parent.id, nameDe: "Caching", nameEn: "Caching" } })).json;
    const duplicate = await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId: parent.id, nameDe: "Caching", nameEn: "Other" } });
    assert.equal(duplicate.status, 409);
    const tree = async () => JSON.stringify((await fetchAs(teacher, "/exam/api/pool/categories")).json);
    const before = await tree();
    const cycle = await fetchAs(teacher, `/exam/api/pool/categories/${parent.id}`, { method: "PUT", body: { parentId: child.id } });
    assert.equal(cycle.status, 400);
    assert.equal(await tree(), before, "the tree is unchanged");

    const question = await newQuestion({ nameDe: "Wandert", nameEn: "Moves", categoryId: child.id });
    const test = await testOf("Editor: moving", [question.id]);
    const full = await fetchAs(teacher, `/exam/api/pool/categories/${child.id}`, { method: "DELETE" });
    assert.equal(full.status, 409);
    assert.match(full.json.error, /1 question/);
    const input = { ...(await editable(question.id)), categoryId: parent.id };
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`, { method: "PUT", body: input })).status, 200);
    const listed = (await fetchAs(teacher, `/exam/api/pool/questions?category=${parent.id}`)).json.find((q) => q.id === question.id);
    assert.deepEqual([listed.category.de.at(-1), listed.uses], ["HTTP und REST", 1]);
    assert.equal((await fetchAs(teacher, `/exam/api/pool/categories/${child.id}`, { method: "DELETE" })).status, 200, "empty now, it goes");

    await teacher.page.goto(`${applicationUrl}/exam/pool/categories`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(`.sl-exam-categories-tree li[data-category="${parent.id}"]`, { timeout: 20000 });
    await fetchAs(teacher, `/exam/api/tests/${test.id}`, { method: "DELETE" });
  });

  test("an unwritten test takes up an edit only on request, with the same questions in the same order", async () => {
    const question = await newQuestion({ nameDe: "Nachziehen", nameEn: "Take up" });
    const other = await newQuestion({ nameDe: "Daneben", nameEn: "Beside" });
    const unwritten = await testOf("Editor: next week", [other.id, question.id]);
    const written = await testOf("Editor: last week", [question.id], { written: true });

    await teacher.page.goto(`${applicationUrl}/exam/pool/questions/${question.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-editor sl-rich-text .sl-rich-text-area", { timeout: 20000 });
    await teacher.page.click(".sl-exam-editor-en .sl-rich-text-area");
    await teacher.page.evaluate(() => {
      document.querySelectorAll(".sl-exam-editor-row:not(.sl-exam-editor-answer) sl-rich-text")[1].value = "<p>What is correct?</p>";
    });
    await teacher.page.click(".sl-exam-editor-actions button[type=submit]");
    await teacher.page.waitForSelector(".sl-exam-editor-tests li", { timeout: 10000 });
    const offered = await teacher.page.$$eval(".sl-exam-editor-tests button", (buttons) => buttons.map((b) => Number(b.dataset.test)));
    assert.deepEqual(offered, [unwritten.id], "only the unwritten test is offered");
    const texts = async (id) => (await fetchAs(teacher, `/exam/api/tests/${id}`)).json.questions.map((q) => [q.questionId, q.textEn]);
    assert.deepEqual(await texts(unwritten.id), [[other.id, "<p>What is right?</p>"], [question.id, "<p>What is right?</p>"]], "not asked: the old text");

    await teacher.page.click(`.sl-exam-editor-tests button[data-test="${unwritten.id}"]`);
    await teacher.page.waitForFunction(() => /Updated/.test(document.querySelector(".sl-exam-editor-tests [role=status]").textContent), { timeout: 10000 });
    assert.deepEqual(await texts(unwritten.id), [[other.id, "<p>What is right?</p>"], [question.id, "<p>What is correct?</p>"]], "taken up, same order");
    assert.deepEqual(await texts(written.id), [[question.id, "<p>What is right?</p>"]], "the written test keeps its text");

    const late = await fetchAs(teacher, `/exam/api/tests/${written.id}`, { method: "PUT", body: { questionIds: [question.id] } });
    assert.equal(late.status, 409, "a test written in the meantime is refused");
    await fetchAs(teacher, `/exam/api/tests/${unwritten.id}`, { method: "DELETE" });
  });
});

// Last in the file: it restarts the instance, and every session has to come
// back through the identity provider afterwards.
describe("online tests: a restart", () => {
  test("a restarted server keeps the attempt, its answers and its browser", async () => {
    const student = await sharedSession("student");
    const teacher = await sharedSession("teacher");
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    const course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    const questions = (await fetchAs(teacher, "/exam/api/pool/questions")).json;
    const test = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Restart", questionIds: questions.map((q) => q.id) } })).json;
    await fetchAs(teacher, `/exam/api/tests/${test.id}/sittings`, {
      method: "POST",
      body: { opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 50 * 60000).toISOString(), durationMinutes: 15 },
    });
    const writing = (await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).json;
    const first = writing.questions[0];
    await fetchAs(student, `/exam/api/attempts/${writing.attempt}/questions/${first.n}`, { method: "PUT", body: { tokens: [first.answers[1].token] } });

    await restartApplication();
    assert.match(applicationOutput(), /Exam module: active/);
    await reauthenticate(student);
    await reauthenticate(teacher);

    const resumed = await fetchAs(student, `/exam/api/attempts/${writing.attempt}`);
    assert.equal(resumed.status, 200, JSON.stringify(resumed.json));
    assert.deepEqual(resumed.json.questions.find((q) => q.n === first.n).chosen, [first.answers[1].token], "the saved answer is there");
    assert.ok(resumed.json.remainingMs > 0 && resumed.json.remainingMs <= writing.remainingMs, "and the time left runs on");
    await fetchAs(student, `/exam/api/attempts/${writing.attempt}/submit`, { method: "POST" });
  });
});
