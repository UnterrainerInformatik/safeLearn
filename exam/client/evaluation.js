/**
 * A test's evaluation for its class as a popup (`test-evaluation`, design D3):
 * the grade distribution as five bars in the grade colours, the average grade
 * and percentage, and how many students have a result and how many do not.
 * Shared by the sheet's column header and the test's page, so both show the
 * same thing; the numbers come from the server, a snapshot as it opens.
 */

import { gradeTone, setTone } from "./row-tone.js";
import { examApi, format, h, t } from "./frame.js";

const categoryLabels = {
  onlineTests: () => t("exam.categories.onlineTests"),
  manualTests: () => t("exam.categories.manualTests"),
  shortTests: () => t("exam.categories.shortTests"),
};

/** One grade's row: the grade, a bar as long as its share of the largest count, the count. */
function barRow(grade, count, largest) {
  const bar = h("span", { class: "sl-exam-evaluation-bar", style: `width: ${largest === 0 ? 0 : (count / largest) * 100}%` });
  setTone(bar, gradeTone(grade));
  return h(
    "tr",
    { "data-grade": String(grade) },
    h("th", { scope: "row" }, String(grade)),
    h("td", { class: "sl-exam-evaluation-track" }, bar),
    h("td", { class: "sl-exam-evaluation-count" }, String(count))
  );
}

/** A label and its value, as one line of the summary. */
function summaryLine(key, label, value) {
  return [h("dt", {}, label), h("dd", { "data-summary": key }, value)];
}

/** The popup's content for an evaluation as the server answers it. */
function evaluationContent(evaluation) {
  const { column, distribution, results, missing, averageGrade, averageFraction } = evaluation;
  const grades = [1, 2, 3, 4, 5];
  const largest = Math.max(0, ...grades.map((grade) => distribution[grade] ?? 0));
  const meta = [column.date ? format.date(column.date) : null, categoryLabels[column.category]?.() ?? column.category].filter(Boolean).join(" · ");
  return [
    h("h2", { class: "sl-exam-evaluation-title" }, t("exam.evaluation.title", { name: column.name })),
    h("p", { class: "sl-exam-evaluation-meta" }, meta),
    h(
      "table",
      { class: "sl-exam-evaluation-bars" },
      h("caption", {}, t("exam.evaluation.distribution")),
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, t("exam.evaluation.grade")), h("th", { scope: "col" }, h("span", { class: "sl-exam-visually-hidden" }, t("exam.evaluation.share"))), h("th", { scope: "col" }, t("exam.evaluation.count")))),
      h("tbody", {}, grades.map((grade) => barRow(grade, distribution[grade] ?? 0, largest)))
    ),
    results === 0 ? h("p", { class: "sl-exam-evaluation-empty" }, t("exam.evaluation.noResults")) : null,
    h(
      "dl",
      { class: "sl-exam-evaluation-summary" },
      averageGrade === null ? [] : summaryLine("averageGrade", t("exam.evaluation.averageGrade"), format.fixed(averageGrade, 1)),
      averageFraction === null ? [] : summaryLine("averageFraction", t("exam.evaluation.averagePercent"), format.percent(averageFraction, 0)),
      summaryLine("results", t("exam.evaluation.results"), String(results)),
      summaryLine("missing", t("exam.evaluation.missing"), String(missing))
    ),
  ];
}

/**
 * Opens the evaluation of the column `columnKey` (the sheet's key: a manual
 * column's id or `test-<id>`) of course `courseId` as a modal dialog in
 * `host`. The close button, Escape and a click on the shaded page close it;
 * closed, it removes itself and leaves the page as it was.
 */
export async function openEvaluation(host, courseId, columnKey) {
  const body = h("div", { class: "sl-exam-evaluation-body" }, h("p", { role: "status" }, t("exam.evaluation.loading")));
  const dialog = h("dialog", { class: "sl-exam-dialog sl-exam sl-exam-evaluation", "aria-label": t("exam.evaluation.dialog") }, body);
  // The body fills the dialog, so a click on the dialog itself is one on its backdrop.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  host.append(dialog);
  dialog.showModal();
  const closeButton = h("button", { type: "button", class: "sl-exam-evaluation-close", onclick: () => dialog.close() }, t("exam.evaluation.close"));
  try {
    const evaluation = await examApi(`/courses/${encodeURIComponent(courseId)}/columns/${encodeURIComponent(columnKey)}/evaluation`);
    body.replaceChildren(...evaluationContent(evaluation).flat().filter(Boolean), h("p", { class: "sl-exam-evaluation-actions" }, closeButton));
    dialog.dataset.ready = "1";
  } catch (error) {
    body.replaceChildren(h("p", { class: "sl-embed-error", role: "alert" }, error.message), h("p", { class: "sl-exam-evaluation-actions" }, closeButton));
  }
  if (dialog.open) closeButton.focus();
  return dialog;
}

/**
 * The small button that opens a column's evaluation, named by the column for
 * screen readers. `columnKey` is the sheet's key of the column.
 */
export function evaluationButton(host, courseId, columnKey, name) {
  const label = t("exam.evaluation.openFor", { name });
  return h(
    "button",
    { type: "button", class: "sl-exam-column-evaluation", "aria-label": label, title: label, onclick: () => openEvaluation(host, courseId, columnKey) },
    "▤"
  );
}
