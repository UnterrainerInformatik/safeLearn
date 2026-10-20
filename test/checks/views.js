/**
 * The `#exam`, `#practice` and `#answer` pseudo-roles.
 *
 * Reads `md/test-exam-practice-question.md`. All three are resolved from stored
 * preferences — `ve` and `va` — and the exam variant additionally from the
 * teacher or admin role, so every check here writes the preferences its outcome
 * depends on immediately before reading the page.
 *
 * This is a module, not a test file: `test/content.test.js` imports it.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import {
  applicationUrl,
  effectivePreferences,
  render,
  roles,
  setPreferences,
  sharedSession,
} from "../harness.js";

const examPage = "/md/test-exam-practice-question.md";

const examVariant = "Exam-question: Webservices, REST, SQL-Databases";
const practiceVariant = "Practice-question: Webservices, REST, SQL-Databases";
const answerBlock = "Just do it.";

const permissionsPage = "/md/test-perms.md";
const teacherBlock = "Only visible to teachers.";

/** The two cookies an instance without an identity provider keeps preferences in. */
const configCookie = "safelearn_config";
const lastVisitedCookie = "safelearn_last";

/** Every presentation of one page, addressed by its render parameters alone. */
const presentations = ["", "?reveal=true", "?document=true", "?reveal=true&print-pdf=true"];

describe("views", () => {
  const sessions = new Map();
  const carried = new Map();

  before(async () => {
    for (const role of ["student", "teacher"]) {
      const session = await sharedSession(role);
      sessions.set(role, session);
      carried.set(role, await roles(session));
    }
  });

  /** Reads the page with `values` merged over the baseline, and nothing else changed. */
  async function readWith(role, values) {
    const session = sessions.get(role);
    await setPreferences(session, values);
    return (await render(session, examPage)).text;
  }

  /**
   * Every read of the exam/practice page goes through here.
   *
   * The two directives are one rule and its complement, so a combination that
   * shows neither variant has to fail as loudly as one that shows both. Asserting
   * each variant on its own is what let the state that showed neither ship.
   */
  function assertExactlyOne(text, expected, situation) {
    const seen = {
      exam: text.includes(examVariant),
      practice: text.includes(practiceVariant),
    };
    assert.ok(
      seen.exam !== seen.practice,
      `${situation} should see exactly one variant of ${examPage}, ` +
        `but the page showed ${seen.exam ? "both" : "neither"}.`
    );
    assert.ok(seen[expected], `${situation} should see the ${expected} variant of ${examPage}`);
  }

  // ---- 4.1 Exam and practice are mutually exclusive for a teacher ----

  test("a teacher with the exam view on sees the exam question and not the practice one", async () => {
    assert.ok(
      carried.get("teacher").has("teacher") || carried.get("teacher").has("admin"),
      "this check needs a session the application accepts as a teacher"
    );
    const text = await readWith("teacher", { ve: 1 });
    assertExactlyOne(text, "exam", "a teacher with the exam view on");
  });

  test("a teacher with the exam view off sees the practice question and not the exam one", async () => {
    const text = await readWith("teacher", { ve: 0 });
    assertExactlyOne(text, "practice", "a teacher with the exam view off");
  });

  test("a teacher reading the page as a student sees what the student sees", async () => {
    // The exam view is a privilege of the teacher and admin roles, decided after
    // the student-view downgrade has taken those roles away. A session that has
    // given the privilege up is shown the practice variant, whatever the exam
    // preference still holds.
    const asStudentView = await readWith("teacher", { vt: 0, ve: 1 });
    assertExactlyOne(asStudentView, "practice", "a teacher with the teacher view off");

    const asStudent = await readWith("student", { ve: 1 });
    assert.equal(
      asStudentView,
      asStudent,
      "a teacher in the student view should be shown the question a student is shown on the same page"
    );
  });

  // ---- 4.2 A student cannot reach the exam variant ----

  test("a student never reaches the exam question, whatever the exam preference says", async () => {
    assert.ok(
      !carried.get("student").has("teacher") && !carried.get("student").has("admin"),
      "this check needs a session the application does not accept as a teacher"
    );
    for (const ve of [0, 1]) {
      const text = await readWith("student", { ve });
      assert.ok(
        !text.includes(examVariant),
        `the student should not see the exam variant of ${examPage} with the exam preference set to ${ve}`
      );
    }
  });

  test("a student keeps the practice question whether the exam preference is set or not", async () => {
    for (const ve of [0, 1]) {
      const text = await readWith("student", { ve });
      assertExactlyOne(text, "practice", `a student with the exam preference set to ${ve}`);
    }
  });

  // ---- 4.3 The answer block ----

  test("the answer block follows its preference and nothing else", async () => {
    for (const role of ["student", "teacher"]) {
      const withAnswers = await readWith(role, { va: 1 });
      assert.ok(
        withAnswers.includes(answerBlock),
        `the ${role} session should see the answer block with the answer preference on`
      );

      const withoutAnswers = await readWith(role, { va: 0 });
      assert.ok(
        !withoutAnswers.includes(answerBlock),
        `the ${role} session should not see the answer block with the answer preference off`
      );

      // Both reads were taken with the same baseline for every other key, so the
      // answer preference is the only thing that changed between them - and the
      // exam/practice pair stays complementary across both of them.
      assertExactlyOne(withAnswers, "practice", `a ${role} session with the answer preference on`);
      assertExactlyOne(
        withoutAnswers,
        "practice",
        `a ${role} session with the answer preference off`
      );
    }
  });

  // ---- Config parameters come from the account alone (anonymous-publishing) ----

  /** Requests `reference` with the session's cookies, without following a redirect. */
  async function requestUnfollowed(session, reference) {
    const cookies = await session.page.cookies(applicationUrl);
    const response = await fetch(new URL(reference, applicationUrl), {
      redirect: "manual",
      headers: { cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") },
    });
    return {
      status: response.status,
      location: response.headers.get("location"),
      setCookie: response.headers.getSetCookie(),
      body: await response.text(),
    };
  }

  /** Runs `check` with the two preference cookies forged into the session's browser. */
  async function withForgedCookies(session, cookies, check) {
    await session.page.setCookie(
      ...Object.entries(cookies).map(([name, value]) => ({ name, value, url: applicationUrl }))
    );
    try {
      return await check();
    } finally {
      for (const name of Object.keys(cookies)) {
        await session.page.deleteCookie({ name, url: applicationUrl });
      }
    }
  }

  test("a teacher session ignores a forged preference cookie and keeps its stored preferences", async () => {
    const session = sessions.get("teacher");
    await setPreferences(session, { ve: 0, sl: 1 });
    const before = await effectivePreferences(session);
    const forgedLast = "/md/forged-last-visited-page-3b7e.md";
    await withForgedCookies(
      session,
      {
        [configCookie]: encodeURIComponent(JSON.stringify({ vt: 1, ve: 1, va: 1, sl: 1 })),
        [lastVisitedCookie]: encodeURIComponent(forgedLast),
      },
      async () => {
        const text = (await render(session, examPage)).text;
        assertExactlyOne(text, "practice", "a teacher whose stored exam view is off, carrying a forged cookie");

        const page = await requestUnfollowed(session, examPage);
        const root = await requestUnfollowed(session, "/");
        for (const answer of [page, root]) {
          assert.ok(
            !answer.setCookie.some((cookie) => cookie.startsWith(`${configCookie}=`) || cookie.startsWith(`${lastVisitedCookie}=`)),
            "a session's response never sets, changes or deletes the preference cookies"
          );
        }
        assert.equal(root.status, 302, "the root redirects");
        assert.ok(
          !(root.location ?? "").includes("forged-last-visited-page"),
          `the root should follow the account's last visited page, not the cookie's (it went to ${root.location})`
        );
      }
    );
    assert.deepEqual(await effectivePreferences(session), before, "the stored preferences are unchanged");
  });

  test("view preferences in the query string do not change a session's page", async () => {
    const session = sessions.get("teacher");
    await setPreferences(session, { ve: 0 });
    const answer = await requestUnfollowed(session, `${examPage}?ve=1&vt=1`);
    assert.ok(answer.body.includes(practiceVariant), "the stored exam view, off, decides");
    assert.ok(!answer.body.includes(examVariant), "?ve=1 is no way to the exam variant");
  });

  // ---- Render parameters never change what a session may see (role-resolution) ----

  test("every presentation of a page carries the same permitted content for a session", async () => {
    const cases = [
      { role: "student", values: {}, shows: false, situation: "a student" },
      { role: "teacher", values: { vt: 0 }, shows: false, situation: "a teacher in the student view" },
      { role: "teacher", values: { vt: 1 }, shows: true, situation: "a teacher" },
    ];
    for (const { role, values, shows, situation } of cases) {
      const session = sessions.get(role);
      await setPreferences(session, values);
      for (const query of presentations) {
        const answer = await requestUnfollowed(session, `${permissionsPage}${query}`);
        assert.equal(answer.status, 200, `${permissionsPage}${query} should render for ${situation}`);
        assert.equal(
          answer.body.includes(teacherBlock),
          shows,
          `${situation} should ${shows ? "" : "not "}see the teacher block in ${permissionsPage}${query}`
        );
      }
    }
  });
});
