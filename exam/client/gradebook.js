/**
 * The elements of the gradebook (`gradebook`, `gradebook-sheet`, `year-grade`):
 *
 * - `gradebook`: a course's sheet for one semester - one column per
 *   assessment, one row per student, every field saved as it changes
 *   (teachers; a page and an embed)
 * - `gradebook-student`: one student's record in a course - the override and
 *   comment per semester, and their results by column, read-only (teachers)
 * - `scale`: the grading scale (teachers)
 * - `results`: a student's own results (everyone; a page and an embed)
 *
 * Every grade shown is computed on the server; these elements only draw what
 * the API answers.
 */

import { parseNumber as parseTyped } from "../../i18n/format.js";
import { viennaLocal } from "./periods.js";
import { act, displayClass, displayPerson, messageLine } from "./classes.js";
import { defineExamElement, ExamElement, examApi, format, h, markRows, saveOnChange, stickyColumns, t } from "./frame.js";

const categories = ["onlineTests", "manualTests", "participation", "homework"];

/** The categories by name, in the reader's language. */
const categoryLabels = {
  onlineTests: t("exam.categories.onlineTests"),
  manualTests: t("exam.categories.manualTests"),
  participation: t("exam.categories.participation"),
  homework: t("exam.categories.homework"),
};

/** The kind a category's `+` adds a column of. Online tests have no `+`: their columns are the tests. */
const addableKinds = { manualTests: "test", participation: "plusminus", homework: "homework" };

const semesterLabels = { ws: t("exam.gradebook.semester.ws"), ss: t("exam.gradebook.semester.ss") };

/** A date as the reader writes it, or nothing. */
function displayDate(iso) {
  return iso ? format.date(iso) : "";
}

/** A fraction as a percentage for reading: 0.815 → "81,5 %" / "81.5%". */
function percent(fraction) {
  return format.percent(fraction, 1);
}

/** A number as a field shows it, in the reader's format: `17.5` → "17,5" / "17.5". */
function numberText(value) {
  return format.number(value, 2);
}

/** A typed number, with either separator: "17,5" → 17.5; NaN for anything else, a negative one included. */
function parseNumber(text) {
  const value = parseTyped(text);
  return value === null || value < 0 ? Number.NaN : value;
}

/** A result as it was entered: "17/24", "75 %", "+" or "−". */
function entryResult(entry) {
  if (entry.kind === "plusminus") return entry.value === 1 ? "+" : "−";
  if (entry.maxPoints !== null) return `${format.number(entry.points)}/${format.number(entry.maxPoints)}`;
  return percent(entry.value);
}

/** A category's value for a table cell: "81,5 % · 2", or a dash without entries. */
function categoryCell(category) {
  if (!category) return h("td", { class: "sl-exam-quiet" }, "–");
  return h("td", { title: t("exam.gradebook.entries", { count: category.count }) }, `${percent(category.fraction)} · ${category.grade}`);
}

/** A proposal for reading: "2 (81.5 %)", or a dash without one. */
function proposalText(proposal) {
  return proposal ? `${proposal.grade} (${percent(proposal.fraction)})` : "–";
}

/** The winter grade the year builds on: "1 (override)", "2", or a dash. */
function winterText(winter) {
  if (!winter || winter.grade === null) return "–";
  return winter.overridden ? t("exam.gradebook.overridden", { grade: winter.grade }) : String(winter.grade);
}

/** What the categories of a row are, for the proposal's tooltip. */
function categoriesTitle(rowCategories) {
  return categories
    .filter((category) => rowCategories[category])
    .map((category) => `${categoryLabels[category]}: ${percent(rowCategories[category].fraction)}`)
    .join("\n");
}

/** Today as an ISO date, the calendar day in Vienna. */
function today() {
  return viennaLocal(new Date()).date;
}

/** The day before an ISO date. */
function dayBefore(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** The first and last day of `semester` in `year`. */
function semesterRange(year, semester) {
  return semester === "ws" ? [year.startsOn, dayBefore(year.summerStartsOn)] : [year.summerStartsOn, year.endsOn];
}

/** A date for a new column: today, or the semester's nearer end. */
function defaultDate(year, semester) {
  const [from, to] = semesterRange(year, semester);
  const date = today();
  if (date < from) return from;
  if (date > to) return to;
  return date;
}

function courseTitle(course) {
  return `${course.subject} – ${displayClass(course.className)} – ${course.year.name}`;
}

/** A table in its own sideways-scrolling wrapper, with marked rows and its sticky cells kept in place. */
function scrollingTable(table) {
  markRows(table);
  stickyColumns(table);
  return h("div", { class: "sl-exam-scroll" }, table);
}

// ---------------------------------------------------------- the sheet

/** What a result field shows for a stored result in `column`. */
function cellText(column, result) {
  if (!result) return "";
  if (column.readOnly) return `${format.number(result.points)}/${format.number(column.maxPoints)}`;
  if (column.kind === "plusminus") return result.value === 1 ? "+" : "−";
  if (column.maxPoints !== null) return numberText(result.points);
  return numberText(Math.round(result.value * 10000) / 100);
}

/**
 * What a typed value means for `column`: `{ body }` to store, `{ empty }` to
 * remove the result, or `{ reason }` when the field refuses it before any
 * request.
 */
function readCell(column, text) {
  const trimmed = text.trim();
  if (trimmed === "") return { empty: true };
  if (column.kind === "plusminus") {
    const mark = trimmed.replace("−", "-");
    return mark === "+" || mark === "-" ? { body: { mark } } : { reason: t("exam.gradebook.markRefused") };
  }
  const value = parseNumber(trimmed);
  if (Number.isNaN(value)) return { reason: t("exam.gradebook.numberRefused") };
  return { body: column.maxPoints !== null ? { points: value } : { percent: value } };
}

class GradebookView extends ExamElement {
  /** The course's id: given directly, or looked up by class and subject. */
  async courseId() {
    const { course, class: className, subject, year } = this.params;
    if (/^\d+$/.test(course ?? "")) return course;
    const query = new URLSearchParams({ class: className ?? "", subject: subject ?? "" });
    if (year) query.set("year", year);
    return (await examApi(`/course-lookup?${query}`)).id;
  }

  async load() {
    this.resolvedId ??= await this.courseId();
    const semester = this.semester ?? this.params.semester ?? "";
    return examApi(`/courses/${this.resolvedId}/gradebook${semester ? `?semester=${semester}` : ""}`);
  }

  render(overview) {
    const { course, semester } = overview;
    const onPage = this.params.page === "1";
    if (onPage) {
      const heading = document.querySelector("#markdown-content h1");
      if (heading) heading.textContent = t("exam.gradebook.pageHeading", { course: courseTitle(course), semester: semesterLabels[semester] });
    }
    // On a page the module bar chooses the semester; an embed has no bar.
    const picker = onPage
      ? null
      : h(
          "select",
          {
            "aria-label": t("exam.gradebook.semesterLabel"),
            onchange: (event) => {
              this.semester = event.target.value;
              this.reload();
            },
          },
          Object.entries(semesterLabels).map(([value, label]) => h("option", { value, selected: value === semester }, label))
        );
    this.line = messageLine();
    // Every category is shown with its weight, even without columns yet.
    const groups = categories.map((category) => ({ category, columns: overview.columns.filter((column) => column.category === category) }));
    return h(
      "div",
      { class: "sl-exam" },
      onPage ? null : h("h3", {}, t("exam.gradebook.embedHeading", { course: courseTitle(course) })),
      h(
        "p",
        {},
        picker,
        picker ? " " : null,
        h("a", { href: `/exam/courses/${course.id}` }, t("exam.gradebook.configSheet")),
        " · ",
        h("a", { href: "/exam/scale" }, t("exam.gradebook.gradingScale")),
        onPage ? null : [" · ", h("a", { href: `/exam/courses/${course.id}/gradebook?semester=${semester}` }, t("exam.gradebook.openAsPage"))]
      ),
      h(
        "p",
        { class: "sl-exam-quiet" },
        t("exam.gradebook.hintSaving"),
        " ",
        t("exam.gradebook.hintArrows")
      ),
      overview.students.length
        ? this.sheet(overview, groups, overview.students, true)
        : h("p", {}, t("exam.gradebook.emptyRoster")),
      overview.left.length ? [h("h4", {}, t("exam.gradebook.leftHeading", { count: overview.left.length })), this.sheet(overview, groups, overview.left, false)] : null,
      this.line
    );
  }

  /** The leading columns, left to right: the year view adds the winter grade it builds on. */
  leading(semester) {
    const student = t("exam.gradebook.student");
    const proposal = t("exam.gradebook.proposal");
    const override = t("exam.gradebook.teacherOverride");
    const grade = t("exam.gradebook.actualGrade");
    return semester === "ss" ? [student, t("exam.gradebook.winter"), proposal, override, grade] : [student, proposal, override, grade];
  }

  /**
   * The sheet: the leading columns, then the categories as headings spanning
   * their columns, each column's name, date and maximum below, and a field
   * per student and column. `editable` is false for those who left the roster.
   */
  sheet(overview, groups, rows, editable) {
    const { course, semester } = overview;
    const leading = this.leading(semester);
    const headRow = h(
      "tr",
      {},
      leading.map((label, index) => h("th", { rowspan: "2", "data-sticky": String(index) }, label)),
      groups.map((group) =>
        h(
          "th",
          { colspan: String(Math.max(1, group.columns.length)), class: "sl-exam-category" },
          t("exam.gradebook.categoryWeight", { category: categoryLabels[group.category], weight: course.weights[group.category] }),
          editable && addableKinds[group.category]
            ? h("button", { type: "button", class: "sl-exam-add", title: t("exam.gradebook.addColumnTo", { category: categoryLabels[group.category] }), "aria-label": t("exam.gradebook.addColumnTo", { category: categoryLabels[group.category] }), onclick: () => this.addColumn(course, semester, group.category) }, "+")
            : null
        )
      )
    );
    const columnRow = h(
      "tr",
      {},
      groups.map((group) =>
        group.columns.length
          ? group.columns.map((column) => this.columnHead(course, column, editable))
          : h("th", { class: "sl-exam-column-head sl-exam-quiet" }, addableKinds[group.category] ? t("exam.gradebook.noColumns") : t("exam.gradebook.noTests"))
      )
    );
    const ordered = groups.flatMap((group) => group.columns);
    const body = h(
      "tbody",
      {},
      rows.map((row, rowIndex) => this.studentRow(overview, groups, ordered, row, rowIndex, editable))
    );
    const table = h("table", { class: "sl-exam-table sl-exam-sheet sl-exam-gradebook", "data-columns": String(ordered.length) }, h("thead", {}, headRow, columnRow), body);
    if (editable) table.addEventListener("keydown", (event) => this.arrowKey(table, event));
    return scrollingTable(table);
  }

  /**
   * A column's header: its name, date and maximum, editable in place, and its
   * delete button. An online test's column is the test's: its name links to
   * the test, and nothing in it is edited or deleted here.
   */
  columnHead(course, column, editable) {
    if (column.readOnly) {
      return h(
        "th",
        { class: "sl-exam-column-head sl-exam-column-online", "data-column": String(column.id) },
        h("a", { href: `/exam/tests/${column.testId}` }, h("strong", {}, column.name)),
        h("br"),
        displayDate(column.date),
        h("br"),
        `/ ${format.number(column.maxPoints)}`
      );
    }
    if (!editable) {
      return h(
        "th",
        { class: "sl-exam-column-head" },
        h("strong", {}, column.name),
        h("br"),
        displayDate(column.date),
        column.maxPoints !== null ? [h("br"), `/ ${format.number(column.maxPoints)}`] : null
      );
    }
    const put = (body) => examApi(`/assessments/${column.id}`, { method: "PUT", body });
    const name = saveOnChange(h("input", { type: "text", value: column.name, "aria-label": t("exam.gradebook.columnName") }), {
      save: (value) => put({ name: value }),
    });
    // The module's date field: it sends `change` only for a valid new date in
    // the school year, and marks anything else at itself.
    const date = saveOnChange(h("sl-date-input", { value: column.date, min: course.year.startsOn, max: course.year.endsOn, "aria-label": t("exam.gradebook.columnDate") }), {
      check: (value) => (value ? null : t("exam.gradebook.dateMissing")),
      save: (value) => put({ date: value }),
      // A new date may move the column, or out of this semester.
      onSaved: () => this.reload(),
    });
    const max =
      column.kind === "plusminus"
        ? null
        : saveOnChange(
            h("input", {
              type: "text",
              inputmode: "decimal",
              class: "sl-exam-number",
              value: column.maxPoints === null ? "" : numberText(column.maxPoints),
              placeholder: t("exam.gradebook.maxPlaceholder"),
              "aria-label": t("exam.gradebook.maxPoints"),
            }),
            {
              check: (value) => (value.trim() === "" || !Number.isNaN(parseNumber(value)) ? null : t("exam.gradebook.maxRefused")),
              save: (value) => put({ maxPoints: value.trim() === "" ? null : parseNumber(value) }),
              // Every result of the column is recomputed.
              onSaved: () => this.reload(),
            }
          );
    const remove = (event) => {
      if (column.results > 0 && !window.confirm(t("exam.gradebook.deleteColumnConfirm", { name: column.name, count: column.results }))) return;
      act(event.target, this.line, async () => {
        await examApi(`/assessments/${column.id}`, { method: "DELETE" });
        await this.reload();
      });
    };
    return h(
      "th",
      { class: "sl-exam-column-head", "data-column": String(column.id) },
      name,
      date,
      max,
      h("button", { type: "button", class: "sl-exam-delete", title: t("exam.gradebook.deleteColumn"), "aria-label": t("exam.gradebook.deleteNamedColumn", { name: column.name }), onclick: remove }, "×")
    );
  }

  /** One student's row: the leading cells, then one field per column. */
  studentRow(overview, groups, ordered, row, rowIndex, editable) {
    const { course, semester } = overview;
    const proposalCell = h("td", { class: "sl-exam-proposal" });
    const winterCell = semester === "ss" ? h("td", { class: "sl-exam-winter" }) : null;
    const gradeCell = h("td", { class: "sl-exam-grade" });
    const show = (values) => {
      proposalCell.textContent = proposalText(values.proposal);
      proposalCell.title = categoriesTitle(values.categories ?? {});
      if (winterCell) winterCell.textContent = winterText(values.winter);
      gradeCell.textContent = values.effective === null ? "–" : String(values.effective);
    };
    show(row);

    let overrideCell;
    if (editable) {
      const override = h(
        "select",
        { "aria-label": t("exam.gradebook.overrideFor", { person: displayPerson(row) }), class: "sl-exam-override" },
        h("option", { value: "" }, "–"),
        [1, 2, 3, 4, 5].map((grade) => h("option", { value: String(grade), selected: row.override === grade }, String(grade)))
      );
      saveOnChange(override, {
        save: (value) =>
          examApi(`/courses/${course.id}/grades/${encodeURIComponent(row.username)}/${semester}`, {
            method: "PUT",
            body: { override: value ? Number(value) : null },
          }),
        onSaved: (record) => show(record.semesters[semester]),
      });
      overrideCell = h("td", { title: row.comment ?? "" }, override, row.comment ? " ✎" : "");
    } else {
      overrideCell = h("td", { title: row.comment ?? "" }, row.override === null ? "" : String(row.override), row.comment ? " ✎" : "");
    }

    const leadingCells = [
      h("td", {}, h("a", { href: `/exam/courses/${course.id}/students/${encodeURIComponent(row.username)}` }, displayPerson(row))),
      winterCell,
      proposalCell,
      overrideCell,
      gradeCell,
    ].filter(Boolean);
    leadingCells.forEach((cell, index) => cell.setAttribute("data-sticky", String(index)));

    const fieldCells = groups.map((group) =>
      group.columns.length
        ? group.columns.map((column) => this.resultCell(course, column, ordered.indexOf(column), row, rowIndex, editable, show))
        : h("td", {})
    );
    return h("tr", { class: row.leftAt ? "sl-exam-left" : null, "data-student": row.username }, leadingCells, fieldCells);
  }

  /** A student's field in one column, saved as it changes; read-only text for someone who left. */
  resultCell(course, column, columnIndex, row, rowIndex, editable, show) {
    const result = row.results[column.id] ?? null;
    // An online test's result is the attempt's; the sheet shows it as text.
    if (column.readOnly) return h("td", { class: "sl-exam-online-result", "data-column": String(column.id), "data-student": row.username }, cellText(column, result));
    if (!editable) return h("td", {}, cellText(column, result));
    const mark = column.kind === "plusminus";
    let stored = result;
    const field = h("input", {
      type: "text",
      class: mark ? "sl-exam-cell sl-exam-mark" : "sl-exam-cell",
      inputmode: mark ? "text" : "decimal",
      maxlength: mark ? "1" : null,
      autocomplete: "off",
      value: cellText(column, result),
      "data-row": String(rowIndex),
      "data-col": String(columnIndex),
      "data-assessment": String(column.id),
      "data-student": row.username,
      "aria-label": `${displayPerson(row)} – ${column.name}`,
    });
    const path = `/assessments/${column.id}/results/${encodeURIComponent(row.username)}`;
    saveOnChange(field, {
      check: (text) => readCell(column, text).reason ?? null,
      save: async (text) => {
        const typed = readCell(column, text);
        if (typed.empty) return stored === null ? null : examApi(path, { method: "DELETE" });
        return examApi(path, { method: "PUT", body: typed.body });
      },
      onSaved: (answer) => {
        if (!answer) return;
        stored = answer.results[column.id] ?? null;
        show(answer);
      },
    });
    if (mark) {
      // A + or − is set by typing it, replacing what is there: one keystroke
      // is a complete value, so it is saved at once. The minus is shown as −.
      field.addEventListener("keydown", (event) => {
        if (!["+", "-", "−"].includes(event.key)) return;
        event.preventDefault();
        field.value = event.key === "+" ? "+" : "−";
        field.saveNow();
      });
    }
    return h("td", {}, field);
  }

  /**
   * The arrow keys between result fields (design.md, D9): up and down along a
   * column, left and right along a row - but only with the cursor at the
   * value's end or start, so they still move the cursor inside a value. The
   * focus leaving a field fires its `change`, which saves it.
   */
  arrowKey(table, event) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || !field.classList.contains("sl-exam-cell")) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const row = Number(field.dataset.row);
    const col = Number(field.dataset.col);
    const { selectionStart: start, selectionEnd: end, value } = field;
    // A field whose whole text is selected - as it is right after arriving -
    // and a + or − field, which is never edited character by character, stand
    // at both edges.
    const whole = field.classList.contains("sl-exam-mark") || (start === 0 && end === value.length);
    let target;
    if (event.key === "ArrowDown") target = [row + 1, col];
    else if (event.key === "ArrowUp") target = [row - 1, col];
    else if (event.key === "ArrowRight" && (whole || (start === end && end === value.length))) target = [row, col + 1];
    else if (event.key === "ArrowLeft" && (whole || (start === end && start === 0))) target = [row, col - 1];
    else return;
    // Nothing is stepped or moved inside the field; at the sheet's edge the focus stays.
    event.preventDefault();
    // An online test's column has no fields; left and right pass over it.
    const step = target[1] - col;
    const columns = Number(table.dataset.columns);
    let next = table.querySelector(`input.sl-exam-cell[data-row="${target[0]}"][data-col="${target[1]}"]`);
    while (!next && step !== 0 && target[1] >= 0 && target[1] < columns) {
      target[1] += step;
      next = table.querySelector(`input.sl-exam-cell[data-row="${target[0]}"][data-col="${target[1]}"]`);
    }
    if (!next) return;
    next.focus();
    next.select();
  }

  /** The `+` of a category: a column's name, date and, where the category has one, maximum. */
  addColumn(course, semester, category) {
    const kind = addableKinds[category];
    const [from, to] = semesterRange(course.year, semester);
    const line = messageLine();
    const name = h("input", { type: "text", name: "name", placeholder: t("exam.gradebook.namePlaceholder"), "aria-label": t("exam.gradebook.name") });
    const proposed = defaultDate(course.year, semester);
    const date = h("sl-date-input", { name: "date", required: true, min: course.year.startsOn, max: course.year.endsOn, value: proposed, "aria-label": t("exam.gradebook.date") });
    const max = kind === "plusminus" ? null : h("input", { type: "text", name: "maxPoints", inputmode: "decimal", class: "sl-exam-number", placeholder: t("exam.gradebook.percentPlaceholder"), "aria-label": t("exam.gradebook.maxPoints") });
    const dialog = h("dialog", { class: "sl-exam-dialog sl-exam" });
    const form = h(
      "form",
      {
        onsubmit: (event) => {
          event.preventDefault();
          const maxPoints = max && max.value.trim() !== "" ? parseNumber(max.value) : null;
          if (Number.isNaN(maxPoints)) {
            line.report(t("exam.gradebook.maxIsPoints"), true);
            return;
          }
          act(form.querySelector("button[type=submit]"), line, async () => {
            await examApi(`/courses/${course.id}/assessments`, { method: "POST", body: { kind, name: name.value, date: date.value, maxPoints } });
            dialog.close();
            await this.reload();
          });
        },
      },
      h("h3", {}, t("exam.gradebook.newColumn", { category: categoryLabels[category] })),
      h("label", {}, `${t("exam.gradebook.name")} `, name),
      h("label", {}, `${t("exam.gradebook.date")} `, date),
      proposed < from || proposed > to ? null : h("span", { class: "sl-exam-quiet" }, `${semesterLabels[semester]}: ${displayDate(from)} – ${displayDate(to)}`),
      max ? h("label", {}, `${t("exam.gradebook.outOf")} `, max, ` ${t("exam.gradebook.points")}`) : null,
      h("p", {}, h("button", { type: "submit", class: "sl-exam-primary" }, t("exam.gradebook.addColumn")), " ", h("button", { type: "button", onclick: () => dialog.close() }, t("exam.common.cancel"))),
      line
    );
    dialog.append(form);
    dialog.addEventListener("close", () => dialog.remove());
    this.append(dialog);
    dialog.showModal();
    name.focus();
  }
}

// ------------------------------------------------- one student in a course

class GradebookStudent extends ExamElement {
  async load() {
    return examApi(`/courses/${encodeURIComponent(this.params.course)}/students/${encodeURIComponent(this.params.student)}`);
  }

  render(record) {
    const { course, student } = record;
    const heading = document.querySelector("#markdown-content h1");
    if (heading) heading.textContent = `${displayPerson(student)} – ${courseTitle(course)}`;
    return h(
      "div",
      { class: "sl-exam" },
      student.leftAt ? h("p", { class: "sl-exam-quiet" }, t("exam.gradebook.leftOn", { date: displayDate(student.leftAt) })) : null,
      ["ws", "ss"].map((semester) => this.semesterSection(record, semester))
    );
  }

  semesterSection({ course, student, semesters, entries }, semester) {
    const values = semesters[semester];
    const put = (body) =>
      examApi(`/courses/${course.id}/grades/${encodeURIComponent(student.username)}/${semester}`, { method: "PUT", body });
    const proposalCell = h("td", {}, values.proposal ? proposalText(values.proposal) : t("exam.gradebook.noEntries"));
    const gradeCell = h("td", { class: "sl-exam-grade" });
    const showGrade = (current) => {
      const grade = current.effective === null ? "–" : String(current.effective);
      gradeCell.textContent = current.override !== null ? t("exam.gradebook.overridden", { grade }) : grade;
    };
    showGrade(values);

    const override = h(
      "select",
      { "aria-label": t("exam.gradebook.override") },
      h("option", { value: "" }, t("exam.gradebook.noOverride")),
      [1, 2, 3, 4, 5].map((grade) => h("option", { value: String(grade), selected: values.override === grade }, String(grade)))
    );
    saveOnChange(override, {
      save: (value) => put({ override: value ? Number(value) : null }),
      onSaved: (answer) => showGrade(answer.semesters[semester]),
    });
    const comment = h("textarea", { rows: 2, cols: 50, "aria-label": t("exam.gradebook.comment") });
    comment.value = values.comment ?? "";
    saveOnChange(comment, { save: (value) => put({ comment: value }) });
    const visible = h("input", { type: "checkbox", checked: values.commentVisible, "aria-label": t("exam.gradebook.commentVisible") });
    saveOnChange(visible, { value: () => visible.checked, save: (checked) => put({ commentVisible: checked }) });

    const own = entries.filter((entry) => entry.semester === semester);
    return h(
      "section",
      {},
      h("h2", {}, semesterLabels[semester]),
      scrollingTable(
        h(
          "table",
          { class: "sl-exam-table" },
          h(
            "tbody",
            {},
            categories.map((category) => h("tr", {}, h("td", { "data-sticky": "0" }, t("exam.gradebook.categoryWeight", { category: categoryLabels[category], weight: course.weights[category] })), categoryCell(values.categories[category]))),
            semester === "ss" ? h("tr", {}, h("td", { "data-sticky": "0" }, t("exam.gradebook.winterShare", { share: course.winterShare })), h("td", {}, winterText(values.winter))) : null,
            h("tr", {}, h("td", { "data-sticky": "0" }, t("exam.gradebook.proposal")), proposalCell),
            h("tr", {}, h("td", { "data-sticky": "0" }, t("exam.gradebook.actualGrade")), gradeCell)
          )
        )
      ),
      h("p", {}, h("label", {}, `${t("exam.gradebook.teacherOverride")} `, override)),
      h("p", {}, h("label", {}, t("exam.gradebook.comment"), h("br"), comment)),
      h("p", {}, h("label", {}, visible, ` ${t("exam.gradebook.commentVisible")}`)),
      h("h3", {}, t("exam.gradebook.resultsHeading", { count: own.length })),
      own.length ? resultsTable(own) : h("p", { class: "sl-exam-quiet" }, t("exam.gradebook.noSemesterResults")),
      h("p", {}, h("a", { href: `/exam/courses/${course.id}/gradebook?semester=${semester}` }, t("exam.gradebook.enterResults")))
    );
  }
}

/** Results by column, read-only: the column's name and date, the category, the result and its grade. */
function resultsTable(entries) {
  return scrollingTable(
    h(
      "table",
      { class: "sl-exam-table sl-exam-entries" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", { "data-sticky": "0" }, t("exam.gradebook.column")),
          h("th", {}, t("exam.gradebook.date")),
          h("th", {}, t("exam.gradebook.category")),
          h("th", {}, t("exam.gradebook.result")),
          h("th", {}, t("exam.gradebook.grade"))
        )
      ),
      h(
        "tbody",
        {},
        entries.map((entry) =>
          h(
            "tr",
            {},
            h("td", { "data-sticky": "0" }, entry.name),
            h("td", {}, displayDate(entry.date)),
            h("td", {}, categoryLabels[entry.category] ?? entry.category),
            h("td", {}, entryResult(entry)),
            h("td", {}, entry.grade === null ? "" : String(entry.grade))
          )
        )
      )
    )
  );
}

// ---------------------------------------------------------- grading scale

class ScaleView extends ExamElement {
  async load() {
    return examApi("/scale");
  }

  render(scale) {
    const line = messageLine();
    const inputs = Object.fromEntries(
      scale
        .filter(({ grade }) => grade < 5)
        .map(({ grade, minPercent }) => [
          grade,
          h("input", { type: "number", min: "0.1", max: "100", step: "0.1", class: "sl-exam-number", value: String(minPercent), "aria-label": t("exam.gradebook.gradeFrom", { grade }) }),
        ])
    );
    const save = (event) =>
      act(event.target, line, async () => {
        const thresholds = Object.fromEntries(Object.entries(inputs).map(([grade, input]) => [grade, Number(input.value)]));
        await examApi("/scale", { method: "PUT", body: { thresholds } });
        line.report(t("exam.gradebook.scaleSaved"));
      });
    return h(
      "div",
      { class: "sl-exam" },
      h("p", { class: "sl-exam-quiet" }, t("exam.gradebook.scaleHint")),
      h(
        "table",
        { class: "sl-exam-table" },
        h("tbody", {}, Object.entries(inputs).map(([grade, input]) => h("tr", {}, h("td", {}, t("exam.gradebook.gradeFrom", { grade })), h("td", {}, input, " %"))), h("tr", {}, h("td", {}, t("exam.gradebook.gradeFive")), h("td", {}, t("exam.gradebook.belowThat"))))
      ),
      h("p", {}, h("button", { type: "button", class: "sl-exam-primary", onclick: save }, t("exam.common.save"))),
      line
    );
  }
}

// ----------------------------------------------------- a student's results

class ResultsView extends ExamElement {
  async load() {
    return examApi(`/my/results${this.year ? `?year=${this.year}` : ""}`);
  }

  render({ year, years, courses }) {
    const subject = this.params.subject?.trim().toLowerCase();
    const shown = subject ? courses.filter((course) => course.subject.toLowerCase() === subject) : courses;
    const picker =
      years.length > 1
        ? h(
            "p",
            {},
            h(
              "label",
              {},
              `${t("exam.gradebook.schoolYear")} `,
              h(
                "select",
                {
                  onchange: (event) => {
                    this.year = event.target.value;
                    this.reload();
                  },
                },
                years.map((option) => h("option", { value: String(option.id), selected: option.id === year?.id }, option.name))
              )
            )
          )
        : null;
    if (shown.length === 0) {
      return h("div", { class: "sl-exam sl-exam-results" }, picker, h("p", { class: "sl-exam-quiet" }, t("exam.gradebook.noOwnResults")));
    }
    return h("div", { class: "sl-exam sl-exam-results" }, picker, shown.map((course) => this.course(course)));
  }

  course(course) {
    return h(
      "section",
      { class: "sl-exam-result" },
      h("h3", {}, `${course.subject} – ${displayClass(course.className)}`),
      Object.entries(course.semesters).map(([semester, values]) =>
        h(
          "div",
          { class: "sl-exam-semester", "data-semester": semester },
          h(
            "p",
            {},
            h("strong", {}, `${semesterLabels[semester]}: `),
            values.grade === null
              ? t("exam.gradebook.noGradeYet")
              : h("span", { class: "sl-exam-grade" }, t("exam.gradebook.gradeValue", { grade: values.grade })),
            values.fraction !== null ? ` (${percent(values.fraction)})` : ""
          ),
          h(
            "ul",
            { class: "sl-exam-quiet" },
            values.winter ? h("li", {}, t("exam.gradebook.winterGrade", { grade: winterText(values.winter) })) : null,
            categories
              .filter((category) => values.categories[category])
              .map((category) => h("li", {}, `${categoryLabels[category]}: ${percent(values.categories[category].fraction)}`))
          ),
          values.comment ? h("p", { class: "sl-exam-comment" }, values.comment) : null
        )
      ),
      course.entries.length ? resultsTable(course.entries) : h("p", { class: "sl-exam-quiet" }, t("exam.gradebook.noResultsYet"))
    );
  }
}

defineExamElement("gradebook", GradebookView);
defineExamElement("gradebook-student", GradebookStudent);
defineExamElement("scale", ScaleView);
defineExamElement("results", ResultsView);
