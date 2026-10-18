/**
 * The question pool's element (`question-pool`), for teachers:
 *
 * - `pool`: the category tree, a text search, the matching questions with how
 *   often and when each was used, and a preview of one question in German or
 *   English with its correct answers marked and its usage history. With a
 *   course chosen in the module bar (`data-sl-course`), a click anywhere on a
 *   question's row also chooses it for a test - or unchooses it - and the
 *   chosen rows are coloured; they become a new test for that course, or are
 *   added to one of its tests that has not been written yet (`online-test`).
 *   It leads into the editor (`question-editor`): "Edit" on the preview, "New
 *   question" with a category chosen, and the category page; retired
 *   questions are listed, marked, only when asked for.
 * - Questions imported from a file (`question-import`) and not reviewed yet
 *   carry an amber stripe and a badge in their rows, a filter shows only them
 *   (on from the start with `data-sl-unreviewed`, as after an import), and
 *   their preview says where they came from and offers "Mark as reviewed",
 *   which moves on to the next one. "Import questions" leads to the import.
 *
 * The API refuses every session not acting as a teacher; this element only
 * draws what it answers.
 *
 * A question's text and answers are the one place the module draws stored
 * markup rather than text: they are HTML, sanitized on the way in with the
 * renderer's own sanitizer (`exam/pool-import.js`), and their images point at
 * the module's image route only.
 */

import { defineExamElement, ExamApiError, ExamElement, examApi, format, h, markRows, t } from "./frame.js";
import { displayClass } from "./classes.js";

const typeLabels = {
  multichoiceset: t("exam.pool.type.multichoiceset"),
  multichoice: t("exam.pool.type.multichoice"),
  truefalse: t("exam.pool.type.truefalse"),
};

/** A date or the day of a timestamp in the reader's format, "–" for none. */
function displayDate(iso) {
  return iso ? format.date(iso) : "–";
}

/** Stored, sanitized markup as a node. */
function storedMarkup(html, className) {
  const container = h("div", { class: className });
  container.innerHTML = html;
  return container;
}

class PoolView extends ExamElement {
  async load() {
    const courseId = this.params.course;
    const [tree, course, tests] = await Promise.all([
      examApi("/pool/categories"),
      courseId ? examApi(`/courses/${courseId}`) : null,
      courseId ? examApi(`/tests?course=${courseId}`) : null,
    ]);
    return { tree, course, tests: tests ? tests.groups[0].tests.filter((test) => test.started === 0) : [] };
  }

  render({ tree, course, tests }) {
    this.course = course;
    this.chosen = new Set();
    this.assembly = course ? this.assemblyPanel(course, tests) : null;
    this.categoryId = this.params.category ? Number(this.params.category) : null;
    this.includeRetired = false;
    this.onlyUnreviewed = this.params.unreviewed === "1";
    // The questions known not to be reviewed, for the assembly's reminder.
    this.unreviewedIds = new Set();
    this.query = "";
    this.language = "de";
    this.list = h("div", { class: "sl-exam-pool-list" });
    this.preview = h("div", { class: "sl-exam-pool-preview" }, h("p", { class: "sl-exam-quiet" }, t("exam.pool.choosePrompt")));

    const search = h("input", {
      type: "search",
      placeholder: t("exam.pool.search"),
      "aria-label": t("exam.pool.search"),
      class: "sl-exam-pool-search",
    });
    let timer;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.query = search.value;
        this.refreshList();
      }, 250);
    });

    const node = (category) =>
      h(
        "li",
        {},
        h(
          "button",
          {
            type: "button",
            class: category.id === this.categoryId ? "sl-exam-pool-category is-chosen" : "sl-exam-pool-category",
            "data-category": String(category.id),
            onClick: (event) => this.chooseCategory(category.id, event.currentTarget),
          },
          category.nameDe,
          h("span", { class: "sl-exam-quiet" }, ` (${category.total})`)
        ),
        category.children.length > 0 ? h("ul", {}, category.children.map(node)) : null
      );

    this.tree = h(
      "nav",
      { class: "sl-exam-pool-tree", "aria-label": t("exam.pool.categories") },
      h(
        "ul",
        {},
        h(
          "li",
          {},
          h(
            "button",
            {
              type: "button",
              class: this.categoryId === null ? "sl-exam-pool-category is-chosen" : "sl-exam-pool-category",
              "data-category": "",
              onClick: (event) => this.chooseCategory(null, event.currentTarget),
            },
            t("exam.pool.allCategories")
          )
        ),
        tree.map(node)
      )
    );

    const courseQuery = this.params.course ? `?course=${this.params.course}` : "";
    const categories = h("a", { href: `/exam/pool/categories${courseQuery}`, class: "sl-exam-pool-categories-link" }, t("exam.pool.editCategories"));
    const importing = h("a", { href: `/exam/pool/import${courseQuery}`, class: "sl-exam-pool-import-link" }, t("exam.pool.importQuestions"));
    if (tree.length === 0) {
      return h("div", { class: "sl-exam" }, h("p", {}, t("exam.pool.empty")), categories, " · ", importing);
    }
    this.newQuestion = h("a", { class: "sl-exam-pool-new", hidden: this.categoryId === null }, t("exam.pool.newQuestion"));
    this.updateNewQuestion();
    const retired = h("input", {
      type: "checkbox",
      onChange: () => {
        this.includeRetired = retired.checked;
        this.refreshList();
      },
    });
    this.unreviewedBox = h("input", {
      type: "checkbox",
      checked: this.onlyUnreviewed,
      onChange: () => {
        this.onlyUnreviewed = this.unreviewedBox.checked;
        this.refreshList();
      },
    });
    this.unreviewedLabel = h("span", {}, ` ${t("exam.pool.notReviewed")}`);
    this.unreviewedFilter = h("label", { class: "sl-exam-pool-unreviewed-filter", hidden: true }, this.unreviewedBox, this.unreviewedLabel);
    this.refreshList();
    this.countUnreviewed();
    return h(
      "div",
      { class: "sl-exam sl-exam-pool" },
      h("div", { class: "sl-exam-pool-side" }, this.tree, h("p", { class: "sl-exam-pool-tree-tools" }, categories, " · ", importing)),
      h(
        "div",
        { class: "sl-exam-pool-main" },
        this.assembly,
        h(
          "div",
          { class: "sl-exam-pool-tools" },
          search,
          h("label", { class: "sl-exam-quiet" }, retired, ` ${t("exam.pool.showRetired")}`),
          this.unreviewedFilter,
          this.newQuestion
        ),
        this.list
      ),
      this.preview
    );
  }

  /**
   * Where ticked questions become a test of the bar's course: a name and
   * "Create test", or one of the course's unwritten tests to add them to.
   */
  assemblyPanel(course, tests) {
    this.count = h("span", { class: "sl-exam-pool-count" }, t("exam.pool.noneChosen"));
    this.message = h("p", { class: "sl-exam-message", role: "status" });
    const name = h("input", { type: "text", name: "name", maxlength: "80", placeholder: t("exam.pool.testName"), "aria-label": t("exam.pool.testName"), required: true });
    const create = h(
      "form",
      {
        class: "sl-exam-pool-create",
        onSubmit: (event) => {
          event.preventDefault();
          this.assemble(() => examApi(`/courses/${course.id}/tests`, { method: "POST", body: { name: name.value, questionIds: [...this.chosen] } }));
        },
      },
      name,
      h("button", { type: "submit" }, t("exam.pool.createTest"))
    );
    let add = null;
    if (tests.length > 0) {
      const target = h(
        "select",
        { name: "test", "aria-label": t("exam.pool.addTarget") },
        tests.map((test) => h("option", { value: String(test.id) }, test.name))
      );
      add = h(
        "form",
        {
          class: "sl-exam-pool-add",
          onSubmit: (event) => {
            event.preventDefault();
            this.assemble(async () => {
              const test = await examApi(`/tests/${target.value}`);
              const questionIds = test.questions.map((question) => question.questionId);
              for (const id of this.chosen) if (!questionIds.includes(id)) questionIds.push(id);
              return examApi(`/tests/${test.id}`, { method: "PUT", body: { questionIds } });
            });
          },
        },
        `${t("exam.pool.orAddTo")} `,
        target,
        h("button", { type: "submit" }, t("exam.pool.add"))
      );
    }
    return h(
      "section",
      { class: "sl-exam-pool-assembly", "aria-label": t("exam.pool.assemble") },
      h("h2", {}, t("exam.pool.testFor", { course: `${displayClass(course.className)} ${course.subject}` })),
      h("p", {}, this.count),
      create,
      add,
      this.message
    );
  }

  /** Sends the assembly `request` and opens the test it answers. */
  async assemble(request) {
    if (this.chosen.size === 0) {
      this.message.textContent = t("exam.pool.chooseOne");
      return;
    }
    this.message.textContent = "";
    try {
      const test = await request();
      window.location.assign(`/exam/tests/${test.id}`);
    } catch (error) {
      this.message.textContent =
        error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.pool.testSaveFailed");
    }
  }

  /** Chooses a question for the test, or unchooses it, and colours its row. */
  toggle(id, row) {
    if (this.chosen.has(id)) this.chosen.delete(id);
    else this.chosen.add(id);
    const chosen = this.chosen.has(id);
    row.classList.toggle("is-chosen", chosen);
    row.setAttribute("aria-selected", String(chosen));
    this.updateCount();
  }

  /** How many questions are chosen, and how many of them are not reviewed yet. */
  updateCount() {
    if (!this.count) return;
    const n = this.chosen.size;
    const unreviewed = [...this.chosen].filter((id) => this.unreviewedIds.has(id)).length;
    const reminder = unreviewed === 0 ? "" : ` ${n === 1 ? t("exam.pool.chosenUnreviewedOne", { count: unreviewed, total: n }) : t("exam.pool.chosenUnreviewed", { count: unreviewed, total: n })}`;
    this.count.textContent = (n === 0 ? t("exam.pool.noneChosen") : t("exam.pool.chosen", { count: n })) + reminder;
  }

  /** The filter "Not reviewed (n)", shown while any question awaits review or the filter is on. */
  async countUnreviewed() {
    let questions;
    try {
      questions = await examApi("/pool/questions?unreviewed=1");
    } catch (error) {
      console.error("[exam] the unreviewed questions could not be counted:", error);
      return;
    }
    for (const question of questions) this.unreviewedIds.add(question.id);
    this.unreviewedLabel.textContent = ` ${t("exam.pool.notReviewedCount", { count: questions.length })}`;
    this.unreviewedFilter.hidden = questions.length === 0 && !this.onlyUnreviewed;
  }

  chooseCategory(categoryId, button) {
    this.categoryId = categoryId;
    for (const chosen of this.tree.querySelectorAll(".is-chosen")) chosen.classList.remove("is-chosen");
    button.classList.add("is-chosen");
    this.updateNewQuestion();
    this.refreshList();
  }

  /** "New question" is offered with a category chosen, and creates the question there. */
  updateNewQuestion() {
    this.newQuestion.hidden = this.categoryId === null;
    const query = new URLSearchParams();
    if (this.categoryId !== null) query.set("category", String(this.categoryId));
    if (this.params.course) query.set("course", this.params.course);
    this.newQuestion.href = `/exam/pool/questions/new?${query}`;
  }

  /** The editor of a question, returning to the browser with its category chosen. */
  editAddress(question) {
    const query = new URLSearchParams();
    if (this.params.course) query.set("course", this.params.course);
    const text = query.toString();
    return `/exam/pool/questions/${question.id}${text ? `?${text}` : ""}`;
  }

  async refreshList() {
    const params = new URLSearchParams();
    if (this.categoryId !== null) params.set("category", String(this.categoryId));
    if (this.query.trim()) params.set("q", this.query.trim());
    if (this.includeRetired) params.set("retired", "1");
    if (this.onlyUnreviewed) params.set("unreviewed", "1");
    const asked = params.toString();
    this.asked = asked;
    let questions;
    try {
      questions = await examApi(`/pool/questions${asked ? `?${asked}` : ""}`);
    } catch (error) {
      console.error("[exam] the pool's questions could not be loaded:", error);
      this.list.replaceChildren(h("p", { class: "sl-embed-error" }, t("exam.pool.questionsLoadFailed")));
      return;
    }
    // A slower answer to an older question does not overwrite a newer one.
    if (this.asked !== asked) return;
    for (const question of questions) {
      if (question.unreviewed) this.unreviewedIds.add(question.id);
      else this.unreviewedIds.delete(question.id);
    }
    if (questions.length === 0) {
      this.list.replaceChildren(h("p", { class: "sl-exam-quiet" }, t("exam.pool.noMatch")));
      return;
    }
    const table = h(
      "table",
      { class: "sl-exam-table sl-exam-pool-questions" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", {}, t("exam.pool.question")),
          h("th", {}, t("exam.pool.used")),
          h("th", {}, t("exam.pool.lastUsed"))
        )
      ),
      h(
        "tbody",
        {},
        questions.map((question) =>
          h(
            "tr",
            {
              "data-question": String(question.id),
              class:
                [
                  this.course && this.chosen.has(question.id) ? "is-chosen" : null,
                  question.retired ? "is-retired" : null,
                  question.unreviewed ? "is-unreviewed" : null,
                ]
                  .filter(Boolean)
                  .join(" ") || null,
              "aria-selected": this.course ? String(this.chosen.has(question.id)) : null,
              // Anywhere on the row: the preview, and with a course in the
              // bar, choosing or unchoosing the question for the test.
              onClick: (event) => {
                this.showQuestion(question.id);
                if (this.course) this.toggle(question.id, event.currentTarget);
              },
            },
            h(
              "td",
              {},
              h("button", { type: "button", class: "sl-exam-pool-name" }, question.nameDe),
              question.unreviewed ? h("span", { class: "sl-exam-pool-badge" }, t("exam.pool.badge")) : null,
              h("div", { class: "sl-exam-quiet" }, question.excerptDe),
              h(
                "div",
                { class: "sl-exam-quiet sl-exam-pool-kind" },
                `${question.category.de.join(" / ")} · ${typeLabels[question.type] ?? question.type}${question.retired ? ` · ${t("exam.pool.retired")}` : ""}`
              )
            ),
            h("td", {}, `${question.uses}×`),
            h("td", {}, displayDate(question.lastUsedOn))
          )
        )
      )
    );
    this.list.replaceChildren(h("p", { class: "sl-exam-quiet" }, t("exam.pool.questionCount", { count: questions.length })), h("div", { class: "sl-exam-scroll sl-exam-pool-scroll" }, markRows(table)));
    // The question chosen last stays in view while the list scrolls: its
    // row sticks just below the list's sticky head.
    requestAnimationFrame(() => table.style.setProperty("--sl-exam-pool-head", `${table.tHead.offsetHeight}px`));
  }

  async showQuestion(id) {
    this.shown = id;
    let question;
    try {
      question = await examApi(`/pool/questions/${id}`);
    } catch (error) {
      console.error("[exam] the question could not be loaded:", error);
      this.preview.replaceChildren(h("p", { class: "sl-embed-error" }, t("exam.pool.questionLoadFailed")));
      return;
    }
    if (this.shown !== id) return;
    this.question = question;
    this.drawPreview();
  }

  drawPreview() {
    const question = this.question;
    const de = this.language === "de";
    const switcher = h(
      "div",
      { class: "sl-exam-pool-languages", role: "group", "aria-label": t("exam.pool.language") },
      ["de", "en"].map((language) =>
        h(
          "button",
          {
            type: "button",
            "aria-pressed": String(this.language === language),
            onClick: () => {
              this.language = language;
              this.drawPreview();
            },
          },
          language === "de" ? "Deutsch" : "English"
        )
      )
    );
    const usage =
      question.usage.length === 0
        ? h("p", { class: "sl-exam-quiet" }, t("exam.pool.notUsed"))
        : h(
            "ul",
            { class: "sl-exam-pool-usage" },
            question.usage.map((use) =>
              h("li", {}, `${displayClass(use.className)} ${use.subject} (${use.yearName}), ${displayDate(use.usedOn)}`)
            )
          );
    this.preview.replaceChildren(
      h(
        "article",
        { class: "sl-exam-pool-question", lang: this.language },
        h("h2", {}, de ? question.nameDe : question.nameEn),
        h(
          "p",
          { class: "sl-exam-quiet" },
          (de ? question.category.de : question.category.en).join(" / "),
          ` · ${typeLabels[question.type] ?? question.type}`,
          question.retired ? ` · ${t("exam.pool.retired")}` : ""
        ),
        question.unreviewed ? this.reviewBanner(question) : null,
        h("div", { class: "sl-exam-pool-question-tools" }, switcher, h("a", { href: this.editAddress(question), class: "sl-exam-pool-edit" }, t("exam.pool.edit"))),
        storedMarkup(de ? question.textDe : question.textEn, "sl-exam-pool-text"),
        h(
          "ol",
          { class: "sl-exam-pool-answers" },
          question.answers.map((answer) =>
            h(
              "li",
              { class: answer.correct ? "is-correct" : "" },
              h("span", { class: "sl-exam-pool-mark", "aria-label": answer.correct ? t("exam.pool.correct") : t("exam.pool.wrong") }, answer.correct ? "✓" : "✗"),
              storedMarkup(de ? answer.textDe : answer.textEn, "sl-exam-pool-answer")
            )
          )
        ),
        h("h3", {}, t("exam.pool.usedTimes", { count: question.uses })),
        usage
      )
    );
  }

  /** Above an imported question not reviewed yet: where it came from, and "Mark as reviewed". */
  reviewBanner(question) {
    const message = h("span", { role: "status" });
    return h(
      "div",
      { class: "sl-exam-pool-review" },
      h(
        "p",
        {},
        question.importedAt ? `${t("exam.pool.importedOn", { date: displayDate(question.importedAt), teacher: question.importedBy })} ` : `${t("exam.pool.imported")} `,
        question.importFileName ? h("code", {}, question.importFileName) : null,
        question.importedAt ? `, ${t("exam.pool.notReviewedYet")}` : t("exam.pool.notReviewedYet")
      ),
      h("button", { type: "button", onClick: () => this.markReviewed(question.id, message) }, t("exam.pool.markReviewed")),
      message
    );
  }

  /**
   * Clears the mark of the question `id`, in its row too, and shows the next
   * question below it in the list that is not reviewed yet - from the top
   * again past the last - so a batch can be read through in order.
   */
  async markReviewed(id, message) {
    try {
      await examApi(`/pool/questions/${id}/reviewed`, { method: "POST" });
    } catch (error) {
      message.textContent = error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.pool.actionFailed");
      return;
    }
    this.unreviewedIds.delete(id);
    this.updateCount();
    const rows = [...this.list.querySelectorAll("tbody tr[data-question]")];
    const row = rows.find((candidate) => candidate.dataset.question === String(id));
    if (row) {
      row.classList.remove("is-unreviewed");
      row.querySelector(".sl-exam-pool-badge")?.remove();
    }
    this.countUnreviewed();
    const start = row ? rows.indexOf(row) : -1;
    const next = [...rows.slice(start + 1), ...rows.slice(0, Math.max(start, 0))].find((candidate) => candidate.classList.contains("is-unreviewed"));
    if (next) {
      for (const marked of this.list.querySelectorAll("tr.is-marked")) marked.classList.remove("is-marked");
      next.classList.add("is-marked");
      next.scrollIntoView({ block: "nearest" });
      this.showQuestion(Number(next.dataset.question));
    } else {
      this.showQuestion(id);
    }
  }
}

defineExamElement("pool", PoolView);
