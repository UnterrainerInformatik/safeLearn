/**
 * The question pool's element (`question-pool`), for teachers:
 *
 * - `pool`: the category tree, a text search, a type selector, the matching
 *   questions with how often and when each was used, and a preview of one
 *   question in German or English with its correct answers marked - or a
 *   free-text question's model solution - and its usage history. With a
 *   course chosen in the module bar (`data-sl-course`), a click anywhere on a
 *   question's row also chooses it for a test - or unchooses it - and the
 *   chosen rows are coloured; they become a new test for that course, or are
 *   added to one of its tests that has not been written yet (`online-test`).
 *   A new test is created online or on paper (`offline-test-questions`); a
 *   free-text question has a box only for a test on paper, since an online
 *   test cannot hold it. Opened from a test on paper's page with
 *   `data-sl-test` and `data-sl-group`, the browser chooses that group's
 *   questions instead, starting from the ones it holds (pool-quickie D7).
 *   It leads into the editor (`question-editor`): "Edit" on the preview, and
 *   "New question" always, in the chosen category if there is one; retired
 *   questions are listed, marked, only when asked for. The tree is also where
 *   categories are maintained and questions moved (`pool-tree.js`).
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

import { defineExamElement, ExamApiError, ExamElement, examApi, format, h, linkButton, markRows, t } from "./frame.js";
import { displayClass } from "./classes.js";
import { CategoryTree } from "./pool-tree.js";

const typeLabels = {
  multichoiceset: t("exam.pool.type.multichoiceset"),
  multichoice: t("exam.pool.type.multichoice"),
  truefalse: t("exam.pool.type.truefalse"),
  freetext: t("exam.pool.type.freetext"),
};

/** Whether an online test can hold a question of `type`: a choice question only. */
function onlineType(type) {
  return type !== "freetext";
}

/** The offline kinds' labels, as the offline test's form names them. */
const kindLabels = { test: t("exam.offline.countsAsTest"), shorttest: t("exam.offline.countsAsShortTest") };

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
    const targetId = this.params.test;
    const [tree, course, tests, target] = await Promise.all([
      examApi("/pool/categories"),
      courseId ? examApi(`/courses/${courseId}`) : null,
      courseId ? examApi(`/tests?course=${courseId}`) : null,
      targetId ? examApi(`/tests/${targetId}`) : null,
    ]);
    const group = tests?.groups[0] ?? null;
    return {
      tree,
      course,
      // Only an online test not yet written takes questions added here; a test on paper is chosen for by its group.
      tests: group ? group.tests.filter((test) => test.started === 0 && test.kind === "online") : [],
      offlineKinds: group?.offlineKinds ?? [],
      target: target && target.paper ? { test: target, group: this.params.group === "B" ? "B" : "A" } : null,
    };
  }

  render({ tree, course, tests, offlineKinds = [], target = null }) {
    this.course = course;
    this.target = target;
    // A test on paper takes free-text questions; the create form's choice or the target decides.
    this.paperMode = target !== null;
    // Each listed question's type, to unchoose free-text ones when the form switches to online.
    this.types = new Map();
    this.chosen = new Set(target ? target.test.questions.filter((question) => question.group === target.group && question.questionId !== null).map((question) => question.questionId) : []);
    this.assembly = course ? (target ? this.targetPanel(course, target) : this.assemblyPanel(course, tests, offlineKinds)) : null;
    this.categoryId = this.params.category ? Number(this.params.category) : null;
    this.includeRetired = false;
    this.onlyUnreviewed = this.params.unreviewed === "1";
    // The questions known not to be reviewed, for the assembly's reminder.
    this.unreviewedIds = new Set();
    this.query = "";
    // The type selector narrows the list in the browser (design D5); "" is all types.
    this.typeFilter = "";
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

    this.categoryTree = new CategoryTree({
      tree,
      chosenId: this.categoryId,
      onChoose: (id) => this.chooseCategory(id),
      onChanged: () => this.refreshList(),
      newQuestionAddress: (id) => this.newQuestionAddress(id),
    });
    this.tree = this.categoryTree.element;

    const courseQuery = this.params.course ? `?course=${this.params.course}` : "";
    const importing = linkButton({ label: t("exam.pool.importQuestions"), href: `/exam/pool/import${courseQuery}`, class: "sl-exam-pool-import-link" });
    if (tree.length === 0) {
      // The first category is made in the tree, or comes with an import.
      return h("div", { class: "sl-exam" }, h("p", {}, t("exam.pool.empty")), h("p", { class: "sl-exam-actions" }, importing), this.tree);
    }
    // Always offered: without a chosen category the editor asks for one.
    this.newQuestion = linkButton({ label: t("exam.pool.newQuestion"), href: "/exam/pool/questions/new", class: "sl-exam-pool-new" });
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
    const typeSelect = h(
      "select",
      {
        class: "sl-exam-pool-type",
        "aria-label": t("exam.pool.typeFilter"),
        onChange: () => {
          this.typeFilter = typeSelect.value;
          this.drawList();
        },
      },
      h("option", { value: "", selected: true }, t("exam.pool.allTypes")),
      Object.entries(typeLabels).map(([value, label]) => h("option", { value }, label))
    );
    this.unreviewedLabel = h("span", {}, ` ${t("exam.pool.notReviewed")}`);
    this.unreviewedFilter = h("label", { class: "sl-exam-pool-unreviewed-filter", hidden: true }, this.unreviewedBox, this.unreviewedLabel);
    this.refreshList();
    this.countUnreviewed();
    const pool = h(
      "div",
      {
        class: "sl-exam sl-exam-pool",
        // Ctrl+X on a question's row cuts it for Ctrl+V on a category (design D5).
        onKeydown: (event) => {
          const row = event.target.closest?.("tr[data-question]");
          if (!row || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "x") return;
          event.preventDefault();
          this.categoryTree.cutItem({ kind: "question", id: Number(row.dataset.question), label: row.querySelector(".sl-exam-pool-name")?.textContent ?? "", element: row });
        },
      },
      h("div", { class: "sl-exam-pool-side" }, h("p", { class: "sl-exam-pool-tree-tools sl-exam-actions" }, importing), this.tree),
      h(
        "div",
        { class: "sl-exam-pool-main" },
        this.assembly,
        h(
          "div",
          { class: "sl-exam-pool-tools" },
          search,
          typeSelect,
          h("label", { class: "sl-exam-quiet" }, retired, ` ${t("exam.pool.showRetired")}`),
          this.unreviewedFilter,
          this.newQuestion
        ),
        this.list
      ),
      this.preview
    );
    this.categoryTree.enableDrag(pool);
    return pool;
  }

  /**
   * Where ticked questions become a test of the bar's course: a name and
   * "Create test", or one of the course's unwritten tests to add them to.
   */
  assemblyPanel(course, tests, offlineKinds = []) {
    this.count = h("span", { class: "sl-exam-pool-count" }, t("exam.pool.noneChosen"));
    this.message = h("p", { class: "sl-exam-message", role: "status" });
    const name = h("input", { type: "text", name: "name", maxlength: "80", placeholder: t("exam.pool.testName"), "aria-label": t("exam.pool.testName"), required: true });
    // Online or on paper (`offline-test-questions`); on paper only while the course uses tests or short tests.
    const mode = h(
      "select",
      { name: "mode", class: "sl-exam-pool-mode", "aria-label": t("exam.paper.modeLabel") },
      h("option", { value: "online" }, t("exam.paper.modeOnline")),
      offlineKinds.length > 0 ? h("option", { value: "paper" }, t("exam.paper.modePaper")) : null
    );
    const minutes = h("input", { type: "number", name: "durationMinutes", min: "1", max: "600", value: "15", class: "sl-exam-number", "aria-label": t("exam.offline.durationLabel") });
    const kind = h("select", { name: "gradebookKind", "aria-label": t("exam.offline.gradebookKindLabel") }, offlineKinds.map((value) => h("option", { value, selected: value === "shorttest" }, kindLabels[value])));
    const paperFields = h(
      "span",
      { class: "sl-exam-pool-paper-fields", hidden: true },
      " ",
      h("label", {}, `${t("exam.offline.durationLabel")} `, minutes),
      " ",
      h("label", {}, `${t("exam.offline.gradebookKindLabel")} `, kind)
    );
    mode.addEventListener("change", () => {
      this.paperMode = mode.value === "paper";
      paperFields.hidden = !this.paperMode;
      // An online test holds no free-text question: those chosen are unchosen.
      if (!this.paperMode) for (const id of [...this.chosen]) if (!onlineType(this.types.get(id))) this.chosen.delete(id);
      this.updateCount();
      this.refreshList();
    });
    const create = h(
      "form",
      {
        class: "sl-exam-pool-create",
        onSubmit: (event) => {
          event.preventDefault();
          if (this.paperMode) {
            this.assemble(() =>
              examApi(`/courses/${course.id}/offline-tests`, {
                method: "POST",
                body: { name: name.value, durationMinutes: Number(minutes.value), gradebookKind: kind.value, questionIds: [...this.chosen] },
              })
            );
          } else {
            this.assemble(() => examApi(`/courses/${course.id}/tests`, { method: "POST", body: { name: name.value, questionIds: [...this.chosen] } }));
          }
        },
      },
      name,
      " ",
      mode,
      paperFields,
      " ",
      h("button", { type: "submit", class: "sl-exam-action sl-exam-action-primary" }, t("exam.pool.createTest"))
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
              // A copy whose pool question was deleted cannot be chosen again.
              const questionIds = test.questions.map((question) => question.questionId).filter((id) => id !== null);
              for (const id of this.chosen) if (!questionIds.includes(id)) questionIds.push(id);
              return examApi(`/tests/${test.id}`, { method: "PUT", body: { questionIds } });
            });
          },
        },
        `${t("exam.pool.orAddTo")} `,
        target,
        h("button", { type: "submit", class: "sl-exam-action" }, t("exam.pool.add"))
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

  /**
   * Where the ticked questions become group `group`'s of a test on paper
   * (pool-quickie design D7): the group's questions are ticked from the start,
   * and saving sets exactly the ticked ones, in the order they were held and
   * then ticked, and opens the test again.
   */
  targetPanel(course, { test, group }) {
    this.count = h("span", { class: "sl-exam-pool-count" });
    this.message = h("p", { class: "sl-exam-message", role: "status" });
    this.updateCount();
    const held = test.questions.filter((question) => question.group === group).map((question) => question.questionId);
    const save = h(
      "form",
      {
        class: "sl-exam-pool-target",
        onSubmit: async (event) => {
          event.preventDefault();
          const questionIds = [...held.filter((id) => this.chosen.has(id)), ...[...this.chosen].filter((id) => !held.includes(id))];
          this.message.textContent = "";
          try {
            await examApi(`/tests/${test.id}`, { method: "PUT", body: { questionIds, group } });
            window.location.assign(`/exam/tests/${test.id}`);
          } catch (error) {
            this.message.textContent = error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.pool.testSaveFailed");
          }
        },
      },
      h("button", { type: "submit", class: "sl-exam-action sl-exam-action-primary" }, t("exam.paper.saveGroup", { group })),
      " ",
      linkButton({ label: t("exam.tests.cancel"), href: `/exam/tests/${test.id}`, class: "sl-exam-pool-target-cancel" })
    );
    return h(
      "section",
      { class: "sl-exam-pool-assembly sl-exam-pool-assembly-target", "aria-label": t("exam.pool.assemble"), "data-test": String(test.id), "data-group": group },
      h("h2", {}, t("exam.paper.chooseFor", { group, name: test.name, course: `${displayClass(course.className)} ${course.subject}` })),
      h("p", {}, this.count),
      save,
      this.message
    );
  }

  /** Whether the row of a question of `type` can be ticked now: a free-text one only for a test on paper. */
  tickable(type) {
    return onlineType(type) || this.paperMode;
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
    const box = row.querySelector(".sl-exam-pool-box");
    if (box) box.checked = chosen;
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

  /** Follows the tree's choice: the list and New question for the chosen category. */
  chooseCategory(categoryId) {
    this.categoryId = categoryId;
    this.updateNewQuestion();
    this.refreshList();
  }

  /** The editor's address for a new question in category `categoryId` (null: none chosen). */
  newQuestionAddress(categoryId) {
    const query = new URLSearchParams();
    if (categoryId !== null) query.set("category", String(categoryId));
    if (this.params.course) query.set("course", this.params.course);
    const text = query.toString();
    return `/exam/pool/questions/new${text ? `?${text}` : ""}`;
  }

  /** "New question" creates the question in the chosen category, if one is chosen. */
  updateNewQuestion() {
    this.newQuestion.href = this.newQuestionAddress(this.categoryId);
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
    this.loaded = questions;
    this.drawList();
  }

  /** The questions loaded last, narrowed to the type chosen, as the list's table. */
  drawList() {
    if (!this.loaded) return;
    const questions = this.typeFilter === "" ? this.loaded : this.loaded.filter((question) => question.type === this.typeFilter);
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
          this.course ? h("th", { class: "sl-exam-pool-pick" }, h("span", { class: "sl-exam-visually-hidden" }, t("exam.pool.chosenColumn"))) : null,
          h("th", {}, t("exam.pool.question")),
          h("th", {}, t("exam.pool.used")),
          h("th", {}, t("exam.pool.lastUsed"))
        )
      ),
      h(
        "tbody",
        {},
        questions.map((question) =>
          (this.types.set(question.id, question.type), h(
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
                if (this.course && this.tickable(question.type)) this.toggle(question.id, event.currentTarget);
              },
            },
            // The row's choice as a box: a click on it reaches the row, which
            // does the choosing, so box and row never disagree (design D6). A
            // free-text question has none, and says why.
            this.course
              ? h(
                  "td",
                  { class: "sl-exam-pool-pick" },
                  this.tickable(question.type)
                    ? h("input", { type: "checkbox", class: "sl-exam-pool-box", checked: this.chosen.has(question.id), "aria-label": t("exam.pool.chooseQuestion", { name: question.nameDe }) })
                    : null
                )
              : null,
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
              ),
              this.course && !this.tickable(question.type) ? h("div", { class: "sl-exam-quiet sl-exam-pool-not-online" }, t("exam.pool.freetextNotOnline")) : null
            ),
            h("td", {}, `${question.uses}×`),
            h("td", {}, displayDate(question.lastUsedOn))
          ))
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
            class: "sl-exam-action",
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
    // Tests of classes the teacher does not see are counted, never named (class-bound-teachers D9).
    const elsewhere = question.usesElsewhere ?? 0;
    const usage = [
      question.usage.length === 0
        ? elsewhere === 0
          ? h("p", { class: "sl-exam-quiet" }, t("exam.pool.notUsed"))
          : null
        : h(
            "ul",
            { class: "sl-exam-pool-usage" },
            question.usage.map((use) =>
              h("li", {}, `${displayClass(use.className)} ${use.subject} (${use.yearName}), ${displayDate(use.usedOn)}`)
            )
          ),
      elsewhere > 0 ? h("p", { class: "sl-exam-quiet sl-exam-pool-usage-elsewhere" }, t("exam.pool.usedElsewhere", { count: elsewhere })) : null,
    ];
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
        h("div", { class: "sl-exam-pool-question-tools" }, switcher, linkButton({ label: t("exam.pool.edit"), href: this.editAddress(question), class: "sl-exam-pool-edit" })),
        storedMarkup(de ? question.textDe : question.textEn, "sl-exam-pool-text"),
        question.type === "freetext"
          ? h(
              "section",
              { class: "sl-exam-pool-solution", "aria-label": t("exam.pool.modelSolution") },
              h("h3", {}, t("exam.pool.modelSolution")),
              storedMarkup(de ? question.solutionDe : question.solutionEn, "sl-exam-pool-solution-text")
            )
          : h(
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
        ...usage
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
      h("button", { type: "button", class: "sl-exam-action sl-exam-action-primary", onClick: () => this.markReviewed(question.id, message) }, t("exam.pool.markReviewed")),
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
