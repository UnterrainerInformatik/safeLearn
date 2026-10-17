/**
 * The import page of the pool (`question-import`), for teachers:
 *
 * - `pool-import`: the format description to download and hand to a Claude,
 *   a file chosen or dropped, and the server's check of it. A file with
 *   problems lists every one with its line, ready to copy and hand back, and
 *   cannot be imported. A clean file shows its preview - questions per
 *   category and type, the categories it creates, questions the pool seems to
 *   have already - and "Import n questions", after which the pool opens with
 *   only the questions not reviewed yet. Below, the past imports, each with
 *   "Take back" while none of its questions is in a test, confirmed here on
 *   the page.
 *
 * The API refuses every session not acting as a teacher; this element only
 * draws what it answers.
 */

import { defineExamElement, ExamApiError, ExamElement, examApi, h } from "./frame.js";

const typeLabels = {
  multichoiceset: "Several correct",
  multichoice: "One correct",
  truefalse: "True / false",
};

function displayDay(iso) {
  return new Date(iso).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Sends a file's text to the import API as it is, with its name in the
 * query. Resolves to the answer's JSON; rejects like `examApi`, with the
 * problems the server named.
 */
async function sendFile(path, text, name) {
  const response = await fetch(`/exam/api${path}?name=${encodeURIComponent(name)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "text/markdown; charset=utf-8" },
    body: text,
  });
  let answer = {};
  try {
    answer = await response.json();
  } catch {
    // No answer of the module's own.
  }
  if (!response.ok) throw new ExamApiError(response.status, answer?.error, answer?.problems ?? null);
  return answer;
}

/** A problem as one line of text, the way it is copied and handed back. */
function problemLine(problem) {
  return `Line ${problem.line}${problem.question ? ` (${problem.question})` : ""}: ${problem.message}`;
}

class PoolImport extends ExamElement {
  async load() {
    return examApi("/pool/imports");
  }

  render(imports) {
    this.file = null;
    const course = this.params.course ? `?course=${this.params.course}` : "";
    this.poolAddress = (query) => `/exam/pool?${new URLSearchParams({ ...(this.params.course ? { course: this.params.course } : {}), ...query })}`;
    this.result = h("div", { class: "sl-exam-import-result", "aria-live": "polite" });

    const input = h("input", {
      type: "file",
      accept: ".md,text/markdown",
      "aria-label": "Question file",
      onChange: () => {
        if (input.files[0]) this.check(input.files[0]);
      },
    });
    const drop = h(
      "label",
      {
        class: "sl-exam-import-drop",
        onDragover: (event) => {
          event.preventDefault();
          drop.classList.add("is-dragging");
        },
        onDragleave: () => drop.classList.remove("is-dragging"),
        onDrop: (event) => {
          event.preventDefault();
          drop.classList.remove("is-dragging");
          const dropped = event.dataTransfer?.files?.[0];
          if (dropped) this.check(dropped);
        },
      },
      h("span", {}, "Choose the file the Claude wrote, or drop it here: "),
      input
    );

    return h(
      "div",
      { class: "sl-exam sl-exam-import" },
      h("p", {}, h("a", { href: `/exam/pool${course}` }, "Back to the pool")),
      h("h2", {}, "1. The format description"),
      h(
        "p",
        {},
        h("a", { href: "/exam/pool/import/format", download: "safelearn-question-format.md", class: "sl-exam-import-format" }, "Download the format description"),
        " and give it to a Claude together with the topic of the questions. It describes the file the import reads and lists the pool's categories as they are now."
      ),
      h("h2", {}, "2. The file"),
      drop,
      this.result,
      h("h2", {}, "Past imports"),
      this.importsTable(imports)
    );
  }

  /** Reads the file and has the server check it; draws its problems or its preview. */
  async check(file) {
    this.result.replaceChildren(h("p", { class: "sl-exam-quiet" }, `Checking ${file.name}…`));
    let text;
    try {
      text = await file.text();
    } catch {
      this.result.replaceChildren(h("p", { class: "sl-embed-error" }, "The file could not be read."));
      return;
    }
    let answer;
    try {
      answer = await sendFile("/pool/imports/check", text, file.name);
    } catch (error) {
      if (error instanceof ExamApiError && error.problems) {
        this.showProblems(file.name, error.problems);
        return;
      }
      this.result.replaceChildren(h("p", { class: "sl-embed-error" }, error instanceof ExamApiError && error.status < 500 ? error.message : "The file could not be checked. Please try again."));
      return;
    }
    if (answer.problems.length > 0) this.showProblems(file.name, answer.problems);
    else this.showPreview(file.name, text, answer.plan);
  }

  showProblems(name, problems) {
    const lines = [...problems].sort((a, b) => a.line - b.line).map(problemLine);
    const copied = h("span", { class: "sl-exam-quiet", role: "status" });
    const copy = h(
      "button",
      {
        type: "button",
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(lines.join("\n"));
            copied.textContent = " Copied.";
          } catch {
            copied.textContent = " Copying is not allowed here; select the list and copy it.";
          }
        },
      },
      "Copy problems"
    );
    this.result.replaceChildren(
      h(
        "section",
        { class: "sl-exam-import-problems" },
        h("p", { class: "sl-embed-error" }, `${name} cannot be imported: ${problems.length} problem${problems.length === 1 ? "" : "s"}. Nothing was stored. Hand the list back to the Claude that wrote the file.`),
        h("p", {}, copy, copied),
        h("ol", { class: "sl-exam-import-problem-list" }, lines.map((line) => h("li", {}, line)))
      )
    );
  }

  showPreview(name, text, plan) {
    const created = new Set(plan.newCategories.map((category) => category.pathDe));
    const message = h("p", { class: "sl-exam-message", role: "status" });
    const button = h(
      "button",
      {
        type: "button",
        class: "sl-exam-import-go",
        onClick: async () => {
          button.disabled = true;
          message.textContent = "Importing…";
          try {
            await sendFile("/pool/imports", text, name);
            window.location.assign(this.poolAddress({ unreviewed: "1" }));
          } catch (error) {
            button.disabled = false;
            if (error instanceof ExamApiError && error.problems) {
              this.showProblems(name, error.problems);
              return;
            }
            message.textContent = error instanceof ExamApiError && error.status < 500 ? error.message : "The import failed. Nothing was stored. Please try again.";
          }
        },
      },
      `Import ${plan.questions} question${plan.questions === 1 ? "" : "s"}`
    );
    const types = Object.keys(typeLabels);
    this.result.replaceChildren(
      h(
        "section",
        { class: "sl-exam-import-preview" },
        h("p", {}, `${name} is ready to import. Nothing is stored before you confirm.`),
        h(
          "table",
          { class: "sl-exam-table" },
          h("thead", {}, h("tr", {}, h("th", {}, "Category"), types.map((type) => h("th", {}, typeLabels[type])), h("th", {}, "Questions"))),
          h(
            "tbody",
            {},
            plan.categories.map((category) =>
              h(
                "tr",
                {},
                h(
                  "td",
                  {},
                  category.pathDe,
                  h("span", { class: "sl-exam-quiet" }, ` / ${category.pathEn}`),
                  category.existingId === null ? h("span", { class: "sl-exam-import-new" }, "new") : null
                ),
                types.map((type) => h("td", {}, String(category.counts[type]))),
                h("td", {}, String(category.questions))
              )
            )
          )
        ),
        plan.newCategories.length === 0
          ? h("p", { class: "sl-exam-quiet" }, "No category will be created.")
          : h(
              "div",
              {},
              h("h3", {}, "Categories that will be created"),
              h(
                "ul",
                {},
                plan.newCategories.map((category) =>
                  h(
                    "li",
                    {},
                    category.pathDe.split(" / ").at(-1),
                    category.parentDe ? ` under ${category.parentDe}${created.has(category.parentDe) ? " (new as well)" : ""}` : " at the top"
                  )
                )
              )
            ),
        plan.nearDuplicates.length === 0
          ? null
          : h(
              "div",
              { class: "sl-exam-import-duplicates" },
              h("h3", {}, "Questions the pool seems to have already"),
              h("p", { class: "sl-exam-quiet" }, "Their German text equals that of a question in the pool. They are imported anyway; check them afterwards."),
              h(
                "ul",
                {},
                plan.nearDuplicates.map((duplicate) =>
                  h(
                    "li",
                    {},
                    `Line ${duplicate.line} (${duplicate.question}) equals `,
                    h("a", { href: `/exam/pool/questions/${duplicate.existing.id}`, target: "_blank", rel: "noopener" }, duplicate.existing.nameDe),
                    duplicate.existing.retired ? " (retired)" : ""
                  )
                )
              )
            ),
        h("p", {}, button),
        message
      )
    );
  }

  importsTable(imports) {
    if (imports.length === 0) return h("p", { class: "sl-exam-quiet" }, "No file has been imported yet.");
    return h(
      "table",
      { class: "sl-exam-table sl-exam-import-past" },
      h(
        "thead",
        {},
        h("tr", {}, h("th", {}, "Imported"), h("th", {}, "By"), h("th", {}, "File"), h("th", {}, "Questions"), h("th", {}, "Not reviewed"), h("th", {}, ""))
      ),
      h(
        "tbody",
        {},
        imports.map((record) =>
          h(
            "tr",
            { "data-import": String(record.id) },
            h("td", {}, displayDay(record.importedAt)),
            h("td", {}, record.importedBy),
            h("td", {}, record.fileName),
            h("td", {}, String(record.questions)),
            h("td", {}, record.unreviewed > 0 ? h("a", { href: this.poolAddress({ unreviewed: "1" }) }, String(record.unreviewed)) : "0"),
            h("td", {}, record.inUse ? h("span", { class: "sl-exam-quiet" }, "in a test") : this.takeBack(record))
          )
        )
      )
    );
  }

  /** "Take back", confirmed in the page: the module asks no browser dialog. */
  takeBack(record) {
    const cell = h("span", { class: "sl-exam-import-take-back" });
    const ask = () =>
      cell.replaceChildren(
        h("button", { type: "button", onClick: confirm }, "Take back")
      );
    const confirm = () =>
      cell.replaceChildren(
        `Delete its ${record.questions} question${record.questions === 1 ? "" : "s"} and the categories it created, if empty? `,
        h("button", { type: "button", onClick: () => this.takeBackNow(record, cell) }, "Yes, take back"),
        " ",
        h("button", { type: "button", onClick: ask }, "Cancel")
      );
    ask();
    return cell;
  }

  async takeBackNow(record, cell) {
    try {
      await examApi(`/pool/imports/${record.id}`, { method: "DELETE" });
      await this.reload();
    } catch (error) {
      cell.replaceChildren(h("span", { class: "sl-embed-error" }, error instanceof ExamApiError && error.status < 500 ? error.message : "That did not work. Please try again."));
    }
  }
}

defineExamElement("pool-import", PoolImport);
