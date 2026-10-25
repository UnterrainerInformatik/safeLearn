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
import { act, candidateNote, directoryNotice, displayClass, displayPerson, messageLine, personName } from "./classes.js";
import { confirmButton, defineExamElement, ExamElement, examApi, format, h, linkButton, markRows, readOnlyFor, saveOnChange, stickyColumns, t } from "./frame.js";

const categories = ["onlineTests", "manualTests", "shortTests", "participation", "homework"];

/** The categories by name, in the reader's language. */
const categoryLabels = {
  onlineTests: t("exam.categories.onlineTests"),
  manualTests: t("exam.categories.manualTests"),
  shortTests: t("exam.categories.shortTests"),
  participation: t("exam.categories.participation"),
  homework: t("exam.categories.homework"),
};

/** The kind a category's `+` adds a column of. Online tests have no `+`: their columns are the tests. */
const addableKinds = { manualTests: "test", shortTests: "shorttest", participation: "plusminus", homework: "homework" };

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

/** True for a column added without a name, which is named by its ISO date. */
function namedByDate(column) {
  return column.name === column.date;
}

/**
 * A column's header as lines of text: its day without the year and its
 * maximum. The name is left to the header's tooltip and accessible label, so
 * the column is as narrow as its result fields.
 */
function columnLines(column) {
  return [
    h("span", { class: "sl-exam-column-day" }, format.dayMonth(column.date)),
    column.maxPoints === null ? null : h("span", {}, `/${format.number(column.maxPoints)}`),
  ];
}

/** A column's details for hovering over its header: name, full date, and maximum or percent. */
function columnTitle(column) {
  const scoring =
    column.kind === "plusminus" ? null : column.maxPoints === null ? t("exam.gradebook.inPercent") : t("exam.gradebook.outOfMax", { max: format.number(column.maxPoints) });
  return [namedByDate(column) ? null : column.name, displayDate(column.date), scoring].filter(Boolean).join("\n");
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
            "data-sl-reads": "",
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
    // A closed year's sheet shows every result as text (exam-year-change D1).
    const open = !course.year.closed;
    return readOnlyFor(course.year, h(
      "div",
      { class: "sl-exam" },
      onPage ? null : h("h3", {}, t("exam.gradebook.embedHeading", { course: courseTitle(course) })),
      h(
        "p",
        { class: "sl-exam-actions sl-exam-gradebook-actions" },
        picker,
        linkButton({ label: t("exam.gradebook.configSheet"), href: `/exam/courses/${course.id}`, class: "sl-exam-gradebook-config" }),
        linkButton({ label: t("exam.gradebook.gradingScale"), href: `/exam/scale?course=${course.id}`, class: "sl-exam-gradebook-scale" }),
        onPage ? null : linkButton({ label: t("exam.gradebook.openAsPage"), href: `/exam/courses/${course.id}/gradebook?semester=${semester}` })
      ),
      h(
        "p",
        { class: "sl-exam-quiet" },
        t("exam.gradebook.hintSaving"),
        " ",
        t("exam.gradebook.hintArrows")
      ),
      overview.students.length
        ? this.sheet(overview, groups, overview.students, open)
        : h("p", {}, t("exam.gradebook.emptyRoster"), " ", linkButton({ label: t("exam.gradebook.toRoster"), href: `/exam/classes/${course.classId}`, class: "sl-exam-to-roster" })),
      overview.left.length ? [h("h4", {}, t("exam.gradebook.leftHeading", { count: overview.left.length })), this.sheet(overview, groups, overview.left, false)] : null,
      this.line
    ));
  }

  /**
   * The leading columns' headings, left to right, each with its long form for
   * hovering: the year view adds the winter grade it builds on.
   */
  leading(semester, toggle) {
    const student = { label: t("exam.gradebook.student") };
    const candidate = { label: t("exam.participant.column"), title: t("exam.participant.columnLong") };
    const proposal = { label: t("exam.gradebook.proposal"), title: t("exam.gradebook.proposalLong") };
    const override = { label: t("exam.gradebook.teacherOverride"), title: t("exam.gradebook.teacherOverrideLong") };
    const grade = { label: t("exam.gradebook.actualGrade"), title: t("exam.gradebook.actualGradeLong") };
    const winter = { label: t("exam.gradebook.winter") };
    const names = toggle ? [student, candidate] : [student];
    return semester === "ss" ? [...names, winter, proposal, override, grade] : [...names, proposal, override, grade];
  }

  /**
   * The sheet: the leading columns, then the categories as headings spanning
   * their columns, each column's name, date and maximum below, and a field
   * per student and column. `editable` is false for those who left the roster.
   * An editable sheet has the Matura toggle beside the name, unless this
   * instance has no directory to write to or the class is below the fifth
   * year (`exam-participant-role`).
   */
  sheet(overview, groups, rows, editable) {
    const { course, semester } = overview;
    const toggle = editable && overview.participants?.state !== undefined && !["unavailable", "notMaturaClass"].includes(overview.participants.state);
    const leading = this.leading(semester, toggle);
    const headRow = h(
      "tr",
      {},
      leading.map(({ label, title }, index) => h("th", { rowspan: "2", "data-sticky": String(index), class: "sl-exam-leading-head", title }, label)),
      groups.map((group) =>
        h(
          "th",
          { colspan: String(Math.max(1, group.columns.length)), class: "sl-exam-category" },
          t("exam.gradebook.categoryWeight", { category: categoryLabels[group.category], weight: course.weights[group.category] }),
          editable && addableKinds[group.category]
            ? h("button", { type: "button", class: "sl-exam-add", title: t("exam.gradebook.addColumnTo", { category: categoryLabels[group.category] }), "aria-label": t("exam.gradebook.addColumnTo", { category: categoryLabels[group.category] }), onclick: () => this.columnDialog(course, semester, null, group.category) }, "+")
            : null
        )
      )
    );
    const columnRow = h(
      "tr",
      {},
      groups.map((group) =>
        group.columns.length
          ? group.columns.map((column) => this.columnHead(course, column, editable, semester))
          : h("th", { class: "sl-exam-column-head sl-exam-quiet", title: addableKinds[group.category] ? t("exam.gradebook.noColumns") : t("exam.gradebook.noTests") }, "–")
      )
    );
    const ordered = groups.flatMap((group) => group.columns);
    const body = h(
      "tbody",
      {},
      rows.map((row, rowIndex) => this.studentRow(overview, groups, ordered, row, rowIndex, editable, toggle))
    );
    const table = h("table", { class: "sl-exam-table sl-exam-sheet sl-exam-gradebook", "data-columns": String(ordered.length) }, h("thead", {}, headRow, columnRow), body);
    if (editable) table.addEventListener("keydown", (event) => this.arrowKey(table, event));
    return scrollingTable(table);
  }

  /**
   * A column's header: its day and its maximum as text, with the name and
   * the full details on hover. An editable column's header is a button that
   * fills the cell and opens the column's dialog. An online test's column is
   * the test's: its day links to the test, and nothing in it is edited or
   * deleted here. An offline test's column is edited like any other, with a
   * link to its test beside the button (`offline-test`).
   */
  columnHead(course, column, editable, semester) {
    const head = { class: "sl-exam-column-head", "data-column": String(column.id), title: columnTitle(column) };
    if (column.readOnly) {
      const [day, ...rest] = columnLines(column);
      return h(
        "th",
        { ...head, class: "sl-exam-column-head sl-exam-column-online" },
        h("a", { href: `/exam/tests/${column.testId}`, "aria-label": t("exam.gradebook.openTest", { name: column.name }) }, day, rest)
      );
    }
    const testLink = column.testId
      ? h("a", { href: `/exam/tests/${column.testId}`, class: "sl-exam-column-test-link", "aria-label": t("exam.gradebook.openTest", { name: column.name }), title: t("exam.gradebook.openTest", { name: column.name }) }, "↗")
      : null;
    if (!editable) return h("th", { ...head, "data-column": null }, columnLines(column), testLink);
    return h(
      "th",
      head,
      h(
        "button",
        {
          type: "button",
          class: "sl-exam-column-edit",
          "aria-label": t("exam.gradebook.editNamedColumn", { name: column.name }),
          onclick: () => this.columnDialog(course, semester, column, column.category),
        },
        columnLines(column)
      ),
      testLink
    );
  }

  /** One student's row: the leading cells, then one field per column. */
  studentRow(overview, groups, ordered, row, rowIndex, editable, toggle) {
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
      overrideCell = h("td", { title: row.comment ?? "" }, override, row.comment ? [" ", this.commentToggle(row)] : "");
    } else {
      overrideCell = h("td", { title: row.comment ?? "" }, row.override === null ? "" : String(row.override), row.comment ? [" ", this.commentToggle(row)] : "");
    }

    const nameCell = h("td", {}, h("a", { href: `/exam/courses/${course.id}/students/${encodeURIComponent(row.username)}?semester=${semester}` }, displayPerson(row)));
    const markName = (held) => {
      nameCell.classList.toggle("sl-exam-participant", held);
      if (held) nameCell.title = t("exam.participant.candidate");
      else nameCell.removeAttribute("title");
      nameCell.querySelector(".sl-exam-visually-hidden")?.remove();
      if (held) nameCell.firstChild.append(candidateNote());
    };
    markName(row.examParticipant === true);

    const leadingCells = [
      nameCell,
      toggle ? h("td", { class: "sl-exam-participant-cell" }, this.participantToggle(overview, row, markName)) : null,
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

  /**
   * The Matura toggle of one student: grants or withdraws the course's role
   * (`exam-participant-role`). It keeps showing what Keycloak holds - a refused
   * change leaves it as it was and says why beside the sheet. Disabled while
   * the directory holds nothing yet, with the reason on hover.
   */
  participantToggle(overview, row, markName) {
    const waiting = overview.participants.state === "ready" ? null : directoryNotice(overview.participants.state);
    const toggle = h(
      "button",
      {
        type: "button",
        class: "sl-exam-action sl-exam-participant-toggle",
        "aria-pressed": String(row.examParticipant === true),
        "aria-label": t("exam.participant.toggleFor", { person: displayPerson(row) }),
        title: waiting ?? t("exam.participant.toggleFor", { person: displayPerson(row) }),
        disabled: waiting !== null,
        "data-student": row.username,
        onClick: () =>
          act(toggle, this.line, async () => {
            const held = toggle.getAttribute("aria-pressed") !== "true";
            const answer = await examApi(`/courses/${overview.course.id}/participants/${encodeURIComponent(row.username)}`, { method: "PUT", body: { held } });
            toggle.setAttribute("aria-pressed", String(answer.held));
            markName(answer.held);
          }),
      },
      "M"
    );
    return toggle;
  }

  /**
   * The mark of a student's comment, a button that shows the comment's text in
   * a row of its own under the student's row - readable on a tablet, where
   * the cell's tooltip never shows (`gradebook-sheet`).
   */
  commentToggle(row) {
    let shown = null;
    const toggle = h(
      "button",
      {
        type: "button",
        class: "sl-exam-comment-toggle",
        "data-sl-reads": "",
        "aria-expanded": "false",
        "aria-label": t("exam.gradebook.showComment", { person: displayPerson(row) }),
        title: row.comment,
        onClick: () => {
          const tr = toggle.closest("tr");
          if (shown) {
            shown.remove();
            shown = null;
          } else {
            shown = h("tr", { class: "sl-exam-comment-row", "data-comment-of": row.username }, h("td", { colspan: String(tr.children.length) }, h("span", { class: "sl-exam-comment" }, row.comment)));
            tr.after(shown);
          }
          toggle.setAttribute("aria-expanded", String(shown !== null));
        },
      },
      "✎"
    );
    return toggle;
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

  /**
   * A column's dialog: its name, date and, where the category has one,
   * maximum. Opened by the `+` of a category (`column` null), it adds a column
   * on submit. Opened by a column's header, it saves each field as it changes
   * and offers to delete the column; closing it after a save reloads the
   * sheet, since a new date may move the column, or out of this semester, and
   * a new maximum recomputes its results.
   */
  columnDialog(course, semester, column, category) {
    const kind = column ? column.kind : addableKinds[category];
    const [from, to] = semesterRange(course.year, semester);
    const line = messageLine();
    const dialog = h("dialog", { class: "sl-exam-dialog sl-exam" });
    let saved = false;
    // A field whose `change` fires as the dialog closes saves after it.
    const afterSave = () => {
      saved = true;
      if (!dialog.open) this.reload();
    };
    const put = (body) => examApi(`/assessments/${column.id}`, { method: "PUT", body });

    const name = h("input", { type: "text", name: "name", value: column?.name ?? "", placeholder: t("exam.gradebook.namePlaceholder"), "aria-label": t("exam.gradebook.name") });
    const proposed = column ? column.date : defaultDate(course.year, semester);
    const date = h("sl-date-input", { name: "date", required: true, min: course.year.startsOn, max: course.year.endsOn, value: proposed, "aria-label": t("exam.gradebook.date") });
    const max =
      kind === "plusminus"
        ? null
        : h("input", {
            type: "text",
            name: "maxPoints",
            inputmode: "decimal",
            class: "sl-exam-number",
            value: !column || column.maxPoints === null ? "" : numberText(column.maxPoints),
            placeholder: t("exam.gradebook.percentPlaceholder"),
            "aria-label": t("exam.gradebook.maxPoints"),
          });
    const fields = [
      h("h3", {}, column ? t("exam.gradebook.editColumn", { category: categoryLabels[category] }) : t("exam.gradebook.newColumn", { category: categoryLabels[category] })),
      h("label", {}, `${t("exam.gradebook.name")} `, name),
      h("label", {}, `${t("exam.gradebook.date")} `, date),
      column || proposed < from || proposed > to ? null : h("span", { class: "sl-exam-quiet" }, `${semesterLabels[semester]}: ${displayDate(from)} – ${displayDate(to)}`),
      max ? h("label", {}, `${t("exam.gradebook.outOf")} `, max, ` ${t("exam.gradebook.points")}`) : null,
    ];
    const cancel = (label, className) => h("button", { type: "button", class: `sl-exam-action ${className}`, onclick: () => dialog.close() }, label);

    if (column) {
      saveOnChange(name, { save: (value) => put({ name: value }), onSaved: afterSave });
      // The module's date field: it sends `change` only for a valid new date in
      // the school year, and marks anything else at itself.
      saveOnChange(date, {
        check: (value) => (value ? null : t("exam.gradebook.dateMissing")),
        save: (value) => put({ date: value }),
        onSaved: afterSave,
      });
      if (max) {
        saveOnChange(max, {
          check: (value) => (value.trim() === "" || !Number.isNaN(parseNumber(value)) ? null : t("exam.gradebook.maxRefused")),
          save: (value) => put({ maxPoints: value.trim() === "" ? null : parseNumber(value) }),
          onSaved: afterSave,
        });
      }
      const remove = (event) => {
        act(event.target, line, async () => {
          await examApi(`/assessments/${column.id}`, { method: "DELETE" });
          saved = true;
          dialog.close();
        });
      };
      dialog.append(
        h("div", { class: "sl-exam-column-form" }, fields),
        h("p", { class: "sl-exam-quiet" }, t("exam.classes.savedAsChanged")),
        h(
          "p",
          {},
          cancel(t("exam.gradebook.close"), "sl-exam-column-close"),
          " ",
          // An offline test's column goes with its test, on the test's page.
          column.testId
            ? linkButton({ label: t("exam.gradebook.openTestPage"), href: `/exam/tests/${column.testId}`, class: "sl-exam-column-test" })
            : confirmButton({
                class: "sl-exam-delete-column",
                label: t("exam.gradebook.deleteColumn"),
                armed: column.results > 0 ? t("exam.gradebook.deleteColumnArmed", { count: column.results }) : t("exam.gradebook.deleteEmptyColumnArmed"),
                action: remove,
              })
        ),
        line
      );
    } else {
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
              saved = true;
              dialog.close();
            });
          },
        },
        fields,
        h("p", {}, h("button", { type: "submit", class: "sl-exam-primary" }, t("exam.gradebook.addColumn")), " ", cancel(t("exam.common.cancel"), "sl-exam-column-cancel")),
        line
      );
      dialog.append(form);
    }
    dialog.addEventListener("close", () => {
      dialog.remove();
      if (saved) this.reload();
    });
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
    if (heading) {
      heading.textContent = `${displayPerson(student)} – ${courseTitle(course)}`;
      // A Matura candidate's name stands out here too (`exam-participant-role`).
      heading.classList.toggle("sl-exam-participant", student.examParticipant === true);
      if (student.examParticipant) heading.append(candidateNote());
    }
    return readOnlyFor(course.year, h(
      "div",
      { class: "sl-exam" },
      this.neighbours(record),
      h("p", { class: "sl-exam-quiet sl-exam-saved-hint" }, t("exam.classes.savedAsChanged")),
      student.leftAt ? h("p", { class: "sl-exam-quiet" }, t("exam.gradebook.leftOn", { date: displayDate(student.leftAt) })) : null,
      ["ws", "ss"].map((semester) => this.semesterSection(record, semester))
    ));
  }

  /**
   * The way back to the sheet and to the students before and after in its
   * order, keeping the semester the teacher came from (`gradebook-sheet`).
   */
  neighbours({ course, previous, next }) {
    const semester = this.params.semester;
    const query = semester ? `?semester=${semester}` : "";
    const studentAddress = (neighbour) => `/exam/courses/${course.id}/students/${encodeURIComponent(neighbour.username)}${query}`;
    return h(
      "p",
      { class: "sl-exam-actions sl-exam-student-neighbours" },
      previous ? linkButton({ label: ["← ", personName(previous)], href: studentAddress(previous), class: "sl-exam-student-previous", title: t("exam.gradebook.previousStudent") }) : null,
      linkButton({ label: t("exam.gradebook.backToSheet"), href: `/exam/courses/${course.id}/gradebook${query}`, class: "sl-exam-student-back" }),
      next ? linkButton({ label: [personName(next), " →"], href: studentAddress(next), class: "sl-exam-student-next", title: t("exam.gradebook.nextStudent") }) : null
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
      h("p", {}, linkButton({ label: t("exam.gradebook.enterResults"), href: `/exam/courses/${course.id}/gradebook?semester=${semester}`, class: "sl-exam-enter-results" }))
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

  /**
   * The thresholds of grades 1 to 4, saved together as they change, and only
   * while they form a valid scale; until then the status says why not.
   */
  render(scale) {
    const inputs = Object.fromEntries(
      scale
        .filter(({ grade }) => grade < 5)
        .map(({ grade, minPercent }) => [
          grade,
          h("input", { type: "number", min: "0.1", max: "100", step: "0.1", class: "sl-exam-number", value: String(minPercent), "aria-label": t("exam.gradebook.gradeFrom", { grade }) }),
        ])
    );
    const thresholds = () => Object.fromEntries(Object.entries(inputs).map(([grade, input]) => [grade, input.value.trim() === "" ? Number.NaN : Number(input.value)]));
    const status = h("p", { class: "sl-exam-scale-status", "aria-live": "polite" });
    const showStatus = (text, refused = false) => {
      status.textContent = text;
      status.classList.toggle("sl-embed-error", refused);
    };
    const table = h(
      "table",
      { class: "sl-exam-table sl-exam-scale" },
      h("tbody", {}, Object.entries(inputs).map(([grade, input]) => h("tr", {}, h("td", {}, t("exam.gradebook.gradeFrom", { grade })), h("td", {}, input, " %"))), h("tr", {}, h("td", {}, t("exam.gradebook.gradeFive")), h("td", {}, t("exam.gradebook.belowThat"))))
    );
    // One save for the four fields: their `change` events reach the table.
    saveOnChange(table, {
      value: () => JSON.stringify(thresholds()),
      check: () => {
        const reason = scaleProblem(thresholds());
        if (reason) showStatus(reason, true);
        return reason;
      },
      save: async () => {
        try {
          return await examApi("/scale", { method: "PUT", body: { thresholds: thresholds() } });
        } catch (error) {
          showStatus(error.message, true);
          throw error;
        }
      },
      onSaved: () => showStatus(t("exam.gradebook.scaleSaved")),
    });
    return h("div", { class: "sl-exam" }, h("p", { class: "sl-exam-quiet" }, t("exam.gradebook.scaleHint"), " ", t("exam.classes.savedAsChanged")), table, status);
  }
}

/** Why `thresholds` do not form a valid scale, as the server would refuse them, or null. */
function scaleProblem(thresholds) {
  const grades = [1, 2, 3, 4];
  for (const grade of grades) {
    const value = thresholds[grade];
    if (!Number.isFinite(value) || value <= 0 || value > 100 || Math.round(value * 10) !== value * 10) {
      return t("exam.errors.gradebook.thresholdRange", { grade });
    }
  }
  const unordered = grades.find((grade) => grade > 1 && thresholds[grade] >= thresholds[grade - 1]);
  return unordered ? t("exam.errors.gradebook.thresholdOrder", { grade: unordered, better: unordered - 1 }) : null;
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
