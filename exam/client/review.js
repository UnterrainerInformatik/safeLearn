/**
 * The review of a submitted online-test attempt (`exam-attempt-review`,
 * design D6): every question in the attempt's order, every answer marked
 * whether the student chose it and whether it is correct - coded like the
 * board solution, a correct answer highlighted with ✓, a wrong one dimmed
 * with ✗ - and whether each question scored. Above them the test's name,
 * the points and the grade.
 *
 * One element for both readers. With `attempt` alone it is the student's own
 * review (`/attempts/<id>/review`), which the server opens only once the
 * attempt's sitting is over; with `course`, `student` and `attempt` it is the
 * teacher's, on the student's page in the course. Nothing is sent back.
 */

import { defineExamElement, ExamApiError, ExamElement, examApi, h, t } from "./frame.js";

/** Stored, sanitized markup as a node, as the writing page inserts it. */
function storedMarkup(html, className) {
  const container = h("div", { class: className });
  container.innerHTML = html;
  return container;
}

class AttemptReview extends ExamElement {
  /** The teacher's review when the placeholder names a course and a student, the student's own otherwise. */
  get teacher() {
    return Boolean(this.params.course && this.params.student);
  }

  async load() {
    const { course, student, attempt } = this.params;
    const path = this.teacher
      ? `/courses/${encodeURIComponent(course)}/students/${encodeURIComponent(student)}/attempts/${encodeURIComponent(attempt)}`
      : `/attempts/${encodeURIComponent(attempt)}/review`;
    try {
      return await examApi(path);
    } catch (error) {
      // The sitting is not over yet: say so instead of a bare failure.
      if (error instanceof ExamApiError && error.status === 409) return { refused: error.message };
      throw error;
    }
  }

  render(review) {
    const back = this.teacher
      ? h(
          "p",
          { class: "sl-exam-review-back" },
          h("a", { href: `/exam/courses/${encodeURIComponent(this.params.course)}/students/${encodeURIComponent(this.params.student)}` }, t("exam.review.backToStudent"))
        )
      : null;
    if (review.refused) return h("div", { class: "sl-exam sl-exam-review" }, back, h("p", { class: "sl-exam-quiet" }, review.refused));
    return h(
      "div",
      { class: "sl-exam sl-exam-review" },
      back,
      h("h2", { class: "sl-exam-review-name" }, review.name),
      h("p", { class: "sl-exam-review-summary" }, t("exam.review.summary", { score: review.score, count: review.questionCount, grade: review.grade })),
      review.questions.map((question) => this.question(question, review.language))
    );
  }

  /** One question: its number in the reader's language, whether it scored, its text and answers in the course's. */
  question(question, language) {
    const scoredText = question.scored ? t("exam.review.scored") : t("exam.review.notScored");
    return h(
      "section",
      { class: `sl-exam-review-question ${question.scored ? "sl-exam-review-scored" : "sl-exam-review-unscored"}`, "data-n": String(question.n) },
      h(
        "h3",
        {},
        h("span", { class: "sl-exam-review-verdict", role: "img", "aria-label": scoredText, title: scoredText }, question.scored ? "✓" : "✗"),
        " ",
        t("exam.review.question", { n: question.n })
      ),
      h(
        "div",
        { class: "sl-exam-review-content", lang: language },
        storedMarkup(question.text, "sl-exam-pool-text"),
        h(
          "ul",
          { class: "sl-exam-review-answers" },
          question.answers.map((answer) => this.answer(answer, question.type === "multichoiceset"))
        )
      )
    );
  }

  /** One answer: the choice mark, the board's correctness mark, and its text. */
  answer(answer, multiple) {
    const choice = multiple ? (answer.chosen ? "☑" : "☐") : answer.chosen ? "●" : "○";
    const correctness = answer.correct ? t("exam.review.correct") : t("exam.review.wrong");
    return h(
      "li",
      {
        class: `${answer.correct ? "sl-exam-review-correct" : "sl-exam-review-wrong"}${answer.chosen ? " sl-exam-review-chosen" : ""}`,
      },
      // Only a chosen answer says so to assistive technology; the empty mark is decoration.
      h(
        "span",
        answer.chosen
          ? { class: "sl-exam-review-choice", role: "img", "aria-label": t("exam.review.chosen"), title: t("exam.review.chosen") }
          : { class: "sl-exam-review-choice", "aria-hidden": "true" },
        choice
      ),
      h("span", { class: "sl-exam-review-mark", role: "img", "aria-label": correctness, title: correctness }, answer.correct ? "✓" : "✗"),
      storedMarkup(answer.text, "sl-exam-pool-answer")
    );
  }
}

defineExamElement("attempt-review", AttemptReview);
