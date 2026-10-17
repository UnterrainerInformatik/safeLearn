/**
 * The elements of the gradebook (`gradebook`):
 *
 * - `gradebook`: a course's overview for one semester, with a form to record
 *   an entry for the whole class at once (teachers; a page and an embed)
 * - `gradebook-student`: one student's record in a course - entries to edit
 *   or delete, and the override and comment per semester (teachers)
 * - `scale`: the grading scale (teachers)
 * - `results`: a student's own results (everyone; a page and an embed)
 *
 * Every grade shown is computed on the server; these elements only draw what
 * the API answers.
 */

import { act, categoryLabels, displayClass, displayDate, displayPerson, messageLine } from "./classes.js";
import { defineExamElement, ExamElement, examApi, h } from "./frame.js";

const categories = ["onlineTests", "manualTests", "participation", "homework"];

const kindLabels = { test: "Test", plusminus: "Participation", homework: "Homework" };

const semesterLabels = { ws: "Winter semester", ss: "Whole year (summer semester)" };

/** A fraction as a percentage for reading: 0.815 → "81.5 %". */
function percent(fraction) {
  return `${(Math.round(fraction * 1000) / 10).toLocaleString()} %`;
}

/** An entry's result as it was entered: "17/24", "75 %", "+" or "−". */
function entryResult(entry) {
  if (entry.kind === "plusminus") return entry.value === 1 ? "+" : "−";
  if (entry.maxPoints !== null) return `${entry.points.toLocaleString()}/${entry.maxPoints.toLocaleString()}`;
  return percent(entry.value);
}

/** A category's value for a table cell: "81.5 % · 2", or a dash without entries. */
function categoryCell(category) {
  if (!category) return h("td", { class: "sl-exam-quiet" }, "–");
  return h("td", { title: `${category.count} entr${category.count === 1 ? "y" : "ies"}` }, `${percent(category.fraction)} · ${category.grade}`);
}

/** Today as an ISO date in the reader's time zone. */
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** A date inside `year` for a new entry: today, or the year's nearer end. */
function defaultDate(year) {
  const date = today();
  if (date < year.startsOn) return year.startsOn;
  if (date > year.endsOn) return year.endsOn;
  return date;
}

function courseTitle(course) {
  return `${course.subject} – ${displayClass(course.className)} – ${course.year.name}`;
}

/**
 * The result fields of an entry of `kind`: a +/− choice for participation,
 * otherwise a result and an optional maximum. Without a maximum the result is
 * a percentage. `read()` answers the API's fields, or null while empty.
 */
function resultFields(kind, initial = null, { withMax = true } = {}) {
  if (kind === "plusminus") {
    const mark = h(
      "select",
      { "aria-label": "Mark" },
      h("option", { value: "" }, ""),
      h("option", { value: "+", selected: initial?.kind === "plusminus" && initial.value === 1 }, "+"),
      h("option", { value: "-", selected: initial?.kind === "plusminus" && initial.value === 0 }, "−")
    );
    return { nodes: [mark], read: () => (mark.value ? { mark: mark.value } : null), focus: () => mark.focus() };
  }
  const fromEntry = initial && initial.kind !== "plusminus";
  const result = h("input", {
    type: "number",
    min: "0",
    step: "any",
    class: "sl-exam-number",
    "aria-label": "Result",
    value: fromEntry ? String(initial.maxPoints !== null ? initial.points : Math.round(initial.value * 10000) / 100) : "",
  });
  const max = withMax
    ? h("input", {
        type: "number",
        min: "0",
        step: "any",
        class: "sl-exam-number",
        "aria-label": "Maximum points",
        placeholder: "%",
        value: fromEntry && initial.maxPoints !== null ? String(initial.maxPoints) : "",
      })
    : null;
  return {
    nodes: max ? [result, " of ", max] : [result],
    max,
    read: (sharedMax = max?.value) => {
      if (result.value === "") return null;
      const value = Number(result.value);
      return sharedMax ? { points: value, maxPoints: Number(sharedMax) } : { fraction: value / 100 };
    },
    focus: () => result.focus(),
  };
}

/**
 * A row of fields for one entry: kind, date, result and note. `read()`
 * answers the entry as the API takes it, or null while the result is empty.
 */
function entryFields(year, initial = null) {
  const kind = h(
    "select",
    { "aria-label": "Kind" },
    Object.entries(kindLabels).map(([value, label]) => h("option", { value, selected: initial?.kind === value }, label))
  );
  const date = h("input", { type: "date", "aria-label": "Date", min: year.startsOn, max: year.endsOn, value: initial?.date ?? defaultDate(year) });
  const note = h("input", { "aria-label": "Note (the student sees it)", placeholder: "note, the student sees it", value: initial?.note ?? "" });
  const slot = h("span", {});
  let result;
  const draw = () => {
    result = resultFields(kind.value, initial);
    slot.replaceChildren(...result.nodes);
  };
  kind.addEventListener("change", draw);
  draw();
  return {
    nodes: [kind, " ", date, " ", slot, " ", note],
    read: () => {
      const value = result.read();
      return value === null ? null : { kind: kind.value, date: date.value, note: note.value, ...value };
    },
  };
}

// --------------------------------------------------------- course overview

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
      if (heading) heading.textContent = `Gradebook – ${courseTitle(course)}`;
    }
    const picker = h(
      "select",
      {
        "aria-label": "Semester",
        onchange: (event) => {
          this.semester = event.target.value;
          this.reload();
        },
      },
      Object.entries(semesterLabels).map(([value, label]) => h("option", { value, selected: value === semester }, label))
    );
    return h(
      "div",
      { class: "sl-exam" },
      onPage ? null : h("h3", {}, `Gradebook – ${courseTitle(course)}`),
      h(
        "p",
        {},
        picker,
        " ",
        h("a", { href: `/exam/courses/${course.id}` }, "Config sheet"),
        " · ",
        h("a", { href: "/exam/scale" }, "Grading scale"),
        onPage ? null : [" · ", h("a", { href: `/exam/courses/${course.id}/gradebook?semester=${semester}` }, "Open as a page")]
      ),
      this.table(course, overview.students),
      overview.left.length ? [h("h4", {}, `Left the roster (${overview.left.length})`), this.table(course, overview.left)] : null,
      overview.students.length ? this.classEntryForm(course, overview.students) : null
    );
  }

  table(course, rows) {
    if (rows.length === 0) return h("p", {}, "Nobody is on this course's roster.");
    return h(
      "table",
      { class: "sl-exam-table sl-exam-gradebook" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", {}, "Student"),
          categories.map((category) => h("th", {}, `${categoryLabels[category]} (${course.weights[category]} %)`)),
          h("th", {}, "Proposal"),
          h("th", {}, "Override"),
          h("th", {}, "Grade")
        )
      ),
      h(
        "tbody",
        {},
        rows.map((row) =>
          h(
            "tr",
            { class: row.leftAt ? "sl-exam-left" : null },
            h("td", {}, h("a", { href: `/exam/courses/${course.id}/students/${encodeURIComponent(row.username)}` }, displayPerson(row))),
            categories.map((category) => categoryCell(row.categories[category])),
            h("td", {}, row.proposal ? `${row.proposal.grade} (${percent(row.proposal.fraction)})` : "–"),
            h("td", { title: row.comment ?? "" }, row.override === null ? "" : String(row.override), row.comment ? " ✎" : ""),
            h("td", { class: "sl-exam-grade" }, row.effective === null ? "–" : String(row.effective))
          )
        )
      )
    );
  }

  /**
   * One entry for every attending student at once, such as a paper test: one
   * kind, date, maximum and note, and a result per student. Students left
   * empty get no entry.
   */
  classEntryForm(course, students) {
    const line = messageLine();
    const kind = h("select", { "aria-label": "Kind" }, Object.entries(kindLabels).map(([value, label]) => h("option", { value }, label)));
    const date = h("input", { type: "date", "aria-label": "Date", min: course.year.startsOn, max: course.year.endsOn, value: defaultDate(course.year) });
    const max = h("input", { type: "number", min: "0", step: "any", class: "sl-exam-number", "aria-label": "Maximum points", placeholder: "%" });
    const maxLabel = h("label", {}, "Out of ", max, " points (empty: results in %)");
    const note = h("input", { "aria-label": "Note (the students see it)", placeholder: "e.g. 1st test" });
    const cells = students.map(() => h("td", {}));
    let fields = [];
    const draw = () => {
      fields = students.map((_, index) => {
        const field = resultFields(kind.value, null, { withMax: false });
        cells[index].replaceChildren(...field.nodes);
        return field;
      });
      maxLabel.hidden = kind.value === "plusminus";
    };
    kind.addEventListener("change", draw);
    draw();

    const save = (event) =>
      act(event.target, line, async () => {
        const shared = kind.value === "plusminus" ? undefined : max.value;
        const entries = [];
        students.forEach((student, index) => {
          const value = fields[index].read(shared);
          if (value) entries.push({ username: student.username, kind: kind.value, date: date.value, note: note.value, ...value });
        });
        if (entries.length === 0) {
          line.report("Enter a result for at least one student.", true);
          return;
        }
        await examApi(`/courses/${course.id}/entries`, { method: "POST", body: { entries } });
        await this.reload();
      });

    return h(
      "details",
      { class: "sl-exam-entry" },
      h("summary", {}, "Record an entry for the class"),
      h("p", {}, h("label", {}, "Kind ", kind), " ", h("label", {}, "Date ", date), " ", maxLabel, " ", h("label", {}, "Note ", note)),
      h("table", { class: "sl-exam-table" }, h("tbody", {}, students.map((student, index) => h("tr", {}, h("td", {}, displayPerson(student)), cells[index])))),
      h("p", {}, h("button", { type: "button", class: "sl-exam-primary", onclick: save }, "Record")),
      line
    );
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
      h("p", {}, h("a", { href: `/exam/courses/${course.id}/gradebook` }, "Back to the gradebook")),
      student.leftAt ? h("p", { class: "sl-exam-quiet" }, `Left the roster on ${displayDate(student.leftAt)}.`) : null,
      ["ws", "ss"].map((semester) => this.semesterSection(record, semester)),
      this.entriesSection(record)
    );
  }

  semesterSection({ course, student, semesters }, semester) {
    const values = semesters[semester];
    const line = messageLine();
    const override = h(
      "select",
      { "aria-label": "Override" },
      h("option", { value: "" }, "none – the proposal counts"),
      [1, 2, 3, 4, 5].map((grade) => h("option", { value: String(grade), selected: values.override === grade }, String(grade)))
    );
    const comment = h("textarea", { rows: 2, cols: 50, "aria-label": "Comment" });
    comment.value = values.comment ?? "";
    const visible = h("input", { type: "checkbox", checked: values.commentVisible });
    const save = (event) =>
      act(event.target, line, async () => {
        await examApi(`/courses/${course.id}/grades/${encodeURIComponent(student.username)}/${semester}`, {
          method: "PUT",
          body: { override: override.value ? Number(override.value) : null, comment: comment.value, commentVisible: visible.checked },
        });
        await this.reload();
      });
    return h(
      "section",
      {},
      h("h2", {}, semesterLabels[semester]),
      h(
        "table",
        { class: "sl-exam-table" },
        h(
          "tbody",
          {},
          categories.map((category) => h("tr", {}, h("td", {}, `${categoryLabels[category]} (${course.weights[category]} %)`), categoryCell(values.categories[category]))),
          h("tr", {}, h("td", {}, "Proposal"), h("td", {}, values.proposal ? `${values.proposal.grade} (${percent(values.proposal.fraction)})` : "– (no entries)")),
          h("tr", {}, h("td", {}, "Grade"), h("td", { class: "sl-exam-grade" }, values.effective === null ? "–" : String(values.effective), values.override !== null ? " (override)" : ""))
        )
      ),
      h("p", {}, h("label", {}, "Override ", override)),
      h("p", {}, h("label", {}, "Comment", h("br"), comment)),
      h("p", {}, h("label", {}, visible, " The student sees the comment")),
      h("p", {}, h("button", { type: "button", onclick: save }, "Save")),
      line
    );
  }

  entriesSection({ course, student, entries }) {
    const line = messageLine();
    const remove = (entry) => (event) => {
      if (!window.confirm("Delete this entry?")) return;
      act(event.target, line, async () => {
        await examApi(`/entries/${entry.id}`, { method: "DELETE" });
        await this.reload();
      });
    };
    const edit = (entry, row) => () => {
      const fields = entryFields(course.year, entry);
      const save = (event) =>
        act(event.target, line, async () => {
          const value = fields.read();
          if (!value) {
            line.report("Enter a result.", true);
            return;
          }
          await examApi(`/entries/${entry.id}`, { method: "PUT", body: value });
          await this.reload();
        });
      row.replaceChildren(
        h("td", { colspan: "5" }, ...fields.nodes),
        h("td", {}, h("button", { type: "button", onclick: save }, "Save"), " ", h("button", { type: "button", onclick: () => this.reload() }, "Cancel"))
      );
    };
    const rows = entries.map((entry) => {
      const row = h("tr", {});
      row.append(
        h("td", {}, displayDate(entry.date)),
        h("td", {}, kindLabels[entry.kind]),
        h("td", {}, entryResult(entry)),
        h("td", {}, entry.grade === null ? "" : String(entry.grade)),
        h("td", {}, entry.note ?? ""),
        h("td", {}, h("button", { type: "button", onclick: edit(entry, row) }, "Edit"), " ", h("button", { type: "button", onclick: remove(entry) }, "Delete"))
      );
      return row;
    });

    const fields = entryFields(course.year);
    const add = (event) =>
      act(event.target, line, async () => {
        const value = fields.read();
        if (!value) {
          line.report("Enter a result.", true);
          return;
        }
        await examApi(`/courses/${course.id}/entries`, { method: "POST", body: { entries: [{ username: student.username, ...value }] } });
        await this.reload();
      });

    return h(
      "section",
      {},
      h("h2", {}, `Entries (${entries.length})`),
      entries.length
        ? h(
            "table",
            { class: "sl-exam-table sl-exam-entries" },
            h("thead", {}, h("tr", {}, h("th", {}, "Date"), h("th", {}, "Kind"), h("th", {}, "Result"), h("th", {}, "Grade"), h("th", {}, "Note"), h("th", {}, ""))),
            h("tbody", {}, rows)
          )
        : h("p", {}, "No entries yet."),
      h("p", {}, ...fields.nodes, " ", h("button", { type: "button", onclick: add }, "Add entry")),
      h("p", { class: "sl-exam-quiet" }, "A result without a maximum is a percentage."),
      line
    );
  }
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
          h("input", { type: "number", min: "0.1", max: "100", step: "0.1", class: "sl-exam-number", value: String(minPercent), "aria-label": `Grade ${grade} from` }),
        ])
    );
    const save = (event) =>
      act(event.target, line, async () => {
        const thresholds = Object.fromEntries(Object.entries(inputs).map(([grade, input]) => [grade, Number(input.value)]));
        await examApi("/scale", { method: "PUT", body: { thresholds } });
        line.report("Saved. Every proposal follows the new scale.");
      });
    return h(
      "div",
      { class: "sl-exam" },
      h("p", { class: "sl-exam-quiet" }, "One scale for every course. A result exactly on a threshold gets the better grade."),
      h(
        "table",
        { class: "sl-exam-table" },
        h("tbody", {}, Object.entries(inputs).map(([grade, input]) => h("tr", {}, h("td", {}, `Grade ${grade} from`), h("td", {}, input, " %"))), h("tr", {}, h("td", {}, "Grade 5"), h("td", {}, "below that")))
      ),
      h("p", {}, h("button", { type: "button", class: "sl-exam-primary", onclick: save }, "Save")),
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
              "School year ",
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
      return h("div", { class: "sl-exam sl-exam-results" }, picker, h("p", { class: "sl-exam-quiet" }, "There are no results for you here yet."));
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
              ? "no grade yet"
              : h("span", { class: "sl-exam-grade" }, `grade ${values.grade}`),
            values.fraction !== null ? ` (${percent(values.fraction)})` : ""
          ),
          h(
            "ul",
            { class: "sl-exam-quiet" },
            categories
              .filter((category) => values.categories[category])
              .map((category) => h("li", {}, `${categoryLabels[category]}: ${percent(values.categories[category].fraction)}`))
          ),
          values.comment ? h("p", { class: "sl-exam-comment" }, values.comment) : null
        )
      ),
      course.entries.length
        ? h(
            "table",
            { class: "sl-exam-table" },
            h("thead", {}, h("tr", {}, h("th", {}, "Date"), h("th", {}, "Kind"), h("th", {}, "Result"), h("th", {}, "Grade"), h("th", {}, "Note"))),
            h(
              "tbody",
              {},
              course.entries.map((entry) =>
                h(
                  "tr",
                  {},
                  h("td", {}, displayDate(entry.date)),
                  h("td", {}, kindLabels[entry.kind] ?? entry.kind),
                  h("td", {}, entryResult(entry)),
                  h("td", {}, entry.grade === null ? "" : String(entry.grade)),
                  h("td", {}, entry.note ?? "")
                )
              )
            )
          )
        : h("p", { class: "sl-exam-quiet" }, "No entries yet.")
    );
  }
}

defineExamElement("gradebook", GradebookView);
defineExamElement("gradebook-student", GradebookStudent);
defineExamElement("scale", ScaleView);
defineExamElement("results", ResultsView);
