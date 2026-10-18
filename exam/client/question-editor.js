/**
 * The question editor's element (`question-editor`), for teachers:
 *
 * - `question-editor`: one question of the pool, or a new one in the category
 *   the browser had chosen - German and English side by side per row: the
 *   title, the question text, and each answer as a pair with one correct flag
 *   for both. Answers are added and removed here, in no order that matters:
 *   every attempt shuffles them. A true/false
 *   question has its two fixed answers and only says which one is right.
 *
 * A refused save shows every problem at its field and keeps the input. A save
 * refused because somebody else saved in between keeps the input too and
 * offers the current version in a new tab. After a save, the tests not yet
 * written that hold the question are listed, each with "Update this test";
 * nothing changes in a test unless that is clicked (exam-question-editor
 * design D8).
 *
 * The API refuses every session not acting as a teacher; this element only
 * draws what it answers.
 */

import { confirmButton, defineExamElement, ExamApiError, ExamElement, examApi, h, linkButton, t } from "./frame.js";
import { displayClass } from "./classes.js";
import "./rich-text.js";

export const typeLabels = {
  multichoice: t("exam.editor.type.multichoice"),
  multichoiceset: t("exam.editor.type.multichoiceset"),
  truefalse: t("exam.pool.type.truefalse"),
};

/** The category tree as a flat list of `{ id, label }`, indented by depth. */
export function flatCategories(tree, depth = 0) {
  return tree.flatMap((node) => [
    { id: node.id, label: `${"  ".repeat(depth)}${node.nameDe} / ${node.nameEn}` },
    ...flatCategories(node.children, depth + 1),
  ]);
}

/** The pool browser, with the category chosen and the bar's course kept. */
export function poolAddress(categoryId, courseId) {
  const query = new URLSearchParams();
  if (categoryId) query.set("category", String(categoryId));
  if (courseId) query.set("course", String(courseId));
  const text = query.toString();
  return `/exam/pool${text ? `?${text}` : ""}`;
}

function richText(label, html) {
  const field = h("sl-rich-text", { "aria-label": label });
  field.value = html ?? "";
  return field;
}

class QuestionEditor extends ExamElement {
  async load() {
    const { question } = this.params;
    const [tree, stored] = await Promise.all([examApi("/pool/categories"), question ? examApi(`/pool/questions/${question}`) : null]);
    return { tree, stored };
  }

  render({ tree, stored }) {
    this.stored = stored;
    this.categories = flatCategories(tree);
    // A new question without a category from the browser starts with none
    // chosen; the form is not sent until one is.
    const initialCategory = stored ? stored.categoryId : Number(this.params.category) || null;
    this.backAddress = () => poolAddress(Number(this.category.value) || initialCategory, this.params.course);
    if (this.categories.length === 0) {
      return h("div", { class: "sl-exam" }, h("p", {}, `${t("exam.categories.none")} `), linkButton({ label: t("exam.editor.createCategoryFirst"), href: poolAddress(null, this.params.course) }));
    }

    this.type = h(
      "select",
      { name: "type", "aria-label": t("exam.editor.typeLabel"), onChange: () => this.typeChanged() },
      Object.entries(typeLabels).map(([value, label]) => h("option", { value, selected: (stored?.type ?? "multichoice") === value }, label))
    );
    this.category = h(
      "select",
      { name: "categoryId", "aria-label": t("exam.import.category"), required: true },
      initialCategory === null ? h("option", { value: "", selected: true }, t("exam.editor.chooseCategory")) : null,
      this.categories.map((category) => h("option", { value: String(category.id), selected: category.id === initialCategory }, category.label))
    );
    this.nameDe = h("input", { type: "text", name: "nameDe", value: stored?.nameDe ?? "", "aria-label": t("exam.editor.germanTitle"), maxlength: "200" });
    this.nameEn = h("input", { type: "text", name: "nameEn", value: stored?.nameEn ?? "", "aria-label": t("exam.editor.englishTitle"), maxlength: "200" });
    this.textDe = richText(t("exam.editor.germanText"), stored?.textDe);
    this.textEn = richText(t("exam.editor.englishText"), stored?.textEn);

    // The answers while the type is not true/false; kept when switching back.
    this.answers = stored && stored.type !== "truefalse"
      ? stored.answers.map((answer) => this.answerRow(answer))
      : [this.answerRow(), this.answerRow()];
    this.statementTrue = stored?.type === "truefalse" ? stored.answers[0].correct : true;
    this.answerList = h("div", { class: "sl-exam-editor-answers", "data-field": "answers" });

    this.problemList = h("ul", { class: "sl-exam-editor-problems sl-embed-error", role: "alert" });
    this.message = h("div", { class: "sl-exam-message", role: "status" });
    this.after = h("div", { class: "sl-exam-editor-after" });

    const row = (label, de, en) =>
      h("div", { class: "sl-exam-editor-row" }, h("div", { class: "sl-exam-editor-label" }, label), h("div", { class: "sl-exam-editor-de", lang: "de" }, de), h("div", { class: "sl-exam-editor-en", lang: "en" }, en));

    this.saveButton = h("button", { type: "submit", class: "sl-exam-primary" }, stored ? t("exam.categories.save") : t("exam.editor.createQuestion"));
    const form = h(
      "form",
      {
        class: "sl-exam-editor-form",
        onSubmit: (event) => {
          event.preventDefault();
          this.save();
        },
      },
      this.retiredNotice(),
      h(
        "div",
        { class: "sl-exam-editor-meta" },
        h("label", {}, `${t("exam.editor.typeLabel")} `, this.type),
        h("label", {}, `${t("exam.import.category")} `, this.category)
      ),
      h("div", { class: "sl-exam-editor-row sl-exam-editor-head" }, h("div"), h("div", {}, "Deutsch"), h("div", {}, "English")),
      row(t("exam.editor.title"), this.nameDe, this.nameEn),
      row(t("exam.pool.question"), this.textDe, this.textEn),
      this.answerList,
      this.problemList,
      h(
        "div",
        { class: "sl-exam-editor-actions" },
        this.saveButton,
        linkButton({ label: t("exam.categories.backToPool"), href: this.backAddress(), class: "sl-exam-editor-back", onClick: (event) => (event.currentTarget.href = this.backAddress()) }),
        stored ? this.lifecycleButtons(stored) : null
      ),
      this.message,
      this.after
    );
    this.drawAnswers();
    return h("div", { class: "sl-exam sl-exam-editor" }, form);
  }

  retiredNotice() {
    this.retiredBox = h("p", { class: "sl-exam-editor-retired", hidden: !this.stored?.retired }, t("exam.editor.retiredNotice"));
    return this.retiredBox;
  }

  /** Retire or revive, and delete, for a stored question. */
  lifecycleButtons(stored) {
    this.retire = h("button", { type: "button", class: "sl-exam-action", "data-action": "retire", hidden: stored.retired, onClick: () => this.setRetired(true) }, t("exam.editor.retire"));
    this.revive = h("button", { type: "button", class: "sl-exam-action", "data-action": "revive", hidden: !stored.retired, onClick: () => this.setRetired(false) }, t("exam.editor.revive"));
    const remove = confirmButton({
      "data-action": "delete",
      label: t("exam.categories.delete"),
      armed: t("exam.editor.deleteArmed"),
      action: () => this.remove(),
    });
    return h("span", { class: "sl-exam-editor-lifecycle" }, this.retire, this.revive, remove);
  }

  /** One answer pair: the correct flag, the German and the English text, and its tools. */
  answerRow(answer = null) {
    const row = {
      correct: h("input", { type: "checkbox", checked: answer?.correct ?? false }),
      de: richText(t("exam.editor.germanAnswer"), answer?.textDe),
      en: richText(t("exam.editor.englishAnswer"), answer?.textEn),
    };
    return row;
  }

  typeChanged() {
    if (this.type.value === "multichoice") {
      // A single choice keeps at most the first correct flag.
      let seen = false;
      for (const answer of this.answers) {
        if (answer.correct.checked && seen) answer.correct.checked = false;
        if (answer.correct.checked) seen = true;
      }
    }
    this.drawAnswers();
  }

  drawAnswers() {
    if (this.type.value === "truefalse") {
      const choice = (value, label) =>
        h(
          "label",
          {},
          h("input", {
            type: "radio",
            name: "statement",
            value: String(value),
            checked: this.statementTrue === value,
            onChange: () => (this.statementTrue = value),
          }),
          ` ${label}`
        );
      this.answerList.replaceChildren(
        h("div", { class: "sl-exam-editor-label" }, t("exam.editor.answer")),
        h(
          "div",
          { class: "sl-exam-editor-truefalse", role: "radiogroup", "aria-label": t("exam.editor.statementIs") },
          `${t("exam.editor.statementIs")} `,
          choice(true, t("exam.editor.statementTrue")),
          " ",
          choice(false, t("exam.editor.statementFalse"))
        )
      );
      return;
    }
    const single = this.type.value === "multichoice";
    const rows = this.answers.map((answer, index) => {
      answer.correct.type = single ? "radio" : "checkbox";
      answer.correct.name = single ? "correct" : "";
      answer.correct.setAttribute("aria-label", t("exam.editor.answerCorrect", { n: index + 1 }));
      return h(
        "div",
        { class: "sl-exam-editor-row sl-exam-editor-answer", "data-answer": String(index + 1) },
        h(
          "div",
          { class: "sl-exam-editor-label" },
          h("label", {}, answer.correct, ` ${index + 1}`),
          h(
            "button",
            { type: "button", class: "sl-exam-editor-remove", title: t("exam.editor.remove"), "aria-label": t("exam.editor.removeAnswer", { n: index + 1 }), onClick: () => this.removeAnswer(index) },
            "✕"
          )
        ),
        h("div", { class: "sl-exam-editor-de", lang: "de" }, answer.de),
        h("div", { class: "sl-exam-editor-en", lang: "en" }, answer.en)
      );
    });
    this.answerList.replaceChildren(
      h("div", { class: "sl-exam-editor-row sl-exam-editor-head" }, h("div", {}, single ? t("exam.editor.correct") : t("exam.editor.correctOnes")), h("div"), h("div")),
      ...rows,
      h("button", { type: "button", class: "sl-exam-action sl-exam-editor-add", onClick: () => this.addAnswer() }, t("exam.editor.addAnswer"))
    );
  }

  addAnswer() {
    this.answers.push(this.answerRow());
    this.drawAnswers();
    this.answers.at(-1).de.focus();
  }

  removeAnswer(index) {
    this.answers.splice(index, 1);
    this.drawAnswers();
  }

  /** The question as the API takes it. */
  input() {
    const type = this.type.value;
    return {
      version: this.stored?.version,
      categoryId: Number(this.category.value),
      type,
      nameDe: this.nameDe.value,
      nameEn: this.nameEn.value,
      textDe: this.textDe.value,
      textEn: this.textEn.value,
      answers:
        type === "truefalse"
          ? [{ correct: this.statementTrue }, { correct: !this.statementTrue }]
          : this.answers.map((answer) => ({ textDe: answer.de.value, textEn: answer.en.value, correct: answer.correct.checked })),
    };
  }

  /** The field a problem names, to mark it. */
  fieldOf(problem) {
    if (problem.answer !== null && problem.answer !== undefined) {
      const answer = this.answers[problem.answer - 1];
      return answer ? (problem.field === "textEn" ? answer.en : answer.de) : null;
    }
    return { nameDe: this.nameDe, nameEn: this.nameEn, textDe: this.textDe, textEn: this.textEn, type: this.type, categoryId: this.category, answers: this.answerList }[problem.field] ?? null;
  }

  clearProblems() {
    this.problemList.replaceChildren();
    for (const marked of this.querySelectorAll(".is-refused")) {
      marked.classList.remove("is-refused");
      marked.removeAttribute("aria-invalid");
    }
  }

  showProblems(problems) {
    this.problemList.replaceChildren(...problems.map((problem) => h("li", {}, problem.message)));
    for (const problem of problems) {
      const field = this.fieldOf(problem);
      if (!field) continue;
      field.classList.add("is-refused");
      field.setAttribute("aria-invalid", "true");
    }
  }

  async save() {
    this.clearProblems();
    this.message.replaceChildren();
    this.after.replaceChildren();
    this.saveButton.disabled = true;
    try {
      const answer = this.stored
        ? await examApi(`/pool/questions/${this.stored.id}`, { method: "PUT", body: this.input() })
        : await examApi("/pool/questions", { method: "POST", body: this.input() });
      if (!this.stored || answer.unwrittenTests.length === 0) {
        window.location.assign(poolAddress(answer.question.categoryId, this.params.course));
        return;
      }
      this.stored = answer.question;
      this.message.textContent = t("exam.editor.saved");
      this.offerTests(answer.unwrittenTests);
    } catch (error) {
      if (error instanceof ExamApiError && error.status === 422) {
        this.showProblems(error.problems ?? [{ field: null, message: error.message }]);
      } else if (error instanceof ExamApiError && error.status === 409) {
        this.message.replaceChildren(
          h("p", { class: "sl-embed-error" }, error.message),
          h("a", { href: `/exam/pool/questions/${this.stored.id}`, target: "_blank", rel: "noopener", class: "sl-exam-editor-current" }, t("exam.editor.openCurrent"))
        );
      } else {
        this.message.replaceChildren(h("p", { class: "sl-embed-error" }, error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.editor.saveFailed")));
      }
    } finally {
      this.saveButton.disabled = false;
    }
  }

  /** The unwritten tests holding the question, each with the offer to take up the saved version. */
  offerTests(tests) {
    this.after.replaceChildren(
      h("h2", {}, t("exam.editor.unwrittenHeading")),
      h("p", { class: "sl-exam-quiet" }, t("exam.editor.unwrittenExplained")),
      h(
        "ul",
        { class: "sl-exam-editor-tests" },
        tests.map((test) => {
          const status = h("span", { class: "sl-exam-quiet", role: "status" });
          const button = h(
            "button",
            {
              type: "button",
              class: "sl-exam-action",
              "data-test": String(test.id),
              onClick: async () => {
                button.disabled = true;
                status.textContent = "";
                try {
                  const current = await examApi(`/tests/${test.id}`);
                  await examApi(`/tests/${test.id}`, { method: "PUT", body: { questionIds: current.questions.map((question) => question.questionId) } });
                  status.textContent = ` ${t("exam.editor.updated")}`;
                } catch (error) {
                  button.disabled = false;
                  status.classList.add("sl-embed-error");
                  status.textContent = ` ${error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.editor.updateFailed")}`;
                }
              },
            },
            t("exam.editor.updateTest")
          );
          return h(
            "li",
            {},
            h("a", { href: `/exam/tests/${test.id}` }, test.name),
            ` (${displayClass(test.className)} ${test.subject}) `,
            button,
            status
          );
        })
      ),
      h("p", {}, linkButton({ label: t("exam.categories.backToPool"), href: this.backAddress() }))
    );
  }

  async setRetired(retired) {
    this.message.replaceChildren();
    try {
      this.stored = await examApi(`/pool/questions/${this.stored.id}/${retired ? "retire" : "revive"}`, { method: "POST" });
      this.retire.hidden = this.stored.retired;
      this.revive.hidden = !this.stored.retired;
      this.retiredBox.hidden = !this.stored.retired;
      this.message.textContent = retired ? t("exam.editor.retired") : t("exam.editor.revived");
    } catch (error) {
      this.message.replaceChildren(h("p", { class: "sl-embed-error" }, error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.pool.actionFailed")));
    }
  }

  async remove() {
    this.message.replaceChildren();
    try {
      await examApi(`/pool/questions/${this.stored.id}`, { method: "DELETE" });
      window.location.assign(this.backAddress());
    } catch (error) {
      const used = error instanceof ExamApiError && error.status === 409;
      this.message.replaceChildren(
        h("p", { class: "sl-embed-error" }, error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.editor.deleteFailed")),
        used && !this.stored.retired ? h("button", { type: "button", class: "sl-exam-action", "data-action": "retire-instead", onClick: () => this.setRetired(true) }, t("exam.editor.retireInstead")) : null
      );
    }
  }
}

defineExamElement("question-editor", QuestionEditor);
