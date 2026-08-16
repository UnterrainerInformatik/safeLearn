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

import { render, roles, setPreferences, sharedSession } from "../harness.js";

const examPage = "/md/test-exam-practice-question.md";

const examVariant = "Exam-question: Webservices, REST, SQL-Databases";
const practiceVariant = "Practice-question: Webservices, REST, SQL-Databases";
const answerBlock = "Just do it.";

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

  // ---- 4.1 Exam and practice are mutually exclusive for a teacher ----

  test("a teacher with the exam view on sees the exam question and not the practice one", async () => {
    assert.ok(
      carried.get("teacher").has("teacher") || carried.get("teacher").has("admin"),
      "this check needs a session the application accepts as a teacher"
    );
    const text = await readWith("teacher", { ve: 1 });
    assert.ok(text.includes(examVariant), `the teacher should see the exam variant of ${examPage}`);
    assert.ok(
      !text.includes(practiceVariant),
      "the practice variant should be absent while the exam view is on"
    );
  });

  test("a teacher with the exam view off sees the practice question and not the exam one", async () => {
    const text = await readWith("teacher", { ve: 0 });
    assert.ok(
      text.includes(practiceVariant),
      `the teacher should see the practice variant of ${examPage}`
    );
    assert.ok(
      !text.includes(examVariant),
      "the exam variant should be absent while the exam view is off"
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

  test("a student sees the practice question, and setting the exam preference takes it away", async () => {
    const asStudent = await readWith("student", { ve: 0 });
    assert.ok(
      asStudent.includes(practiceVariant),
      `the student should see the practice variant of ${examPage}`
    );

    // The `#practice` directive is granted by `ve == 0` alone, with no role in
    // it, so a student who turns the exam view on loses the practice variant
    // without gaining the exam one and is left with neither. Asserted as the
    // behavior that exists; see docs-testing.md.
    const withExamOn = await readWith("student", { ve: 1 });
    assert.ok(
      !withExamOn.includes(practiceVariant),
      "with the exam preference set, the student loses the practice variant as well"
    );
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
      // answer preference is the only thing that changed between them.
      assert.ok(
        withAnswers.includes(practiceVariant) && withoutAnswers.includes(practiceVariant),
        `the rest of ${examPage} should be unaffected by the answer preference`
      );
    }
  });
});
