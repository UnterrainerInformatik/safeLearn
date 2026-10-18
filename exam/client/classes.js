/**
 * The elements of classes and courses (`class-roster`), all for teachers:
 *
 * - `classes-home`: the classes of one school year, the one the bar chose
 * - `year-new`: a new school year (in the bar's dialog)
 * - `class-new`: a new class, its roster ticked from the directory's checklist
 *   (in the bar's dialog)
 * - `class`: one class's roster during the year, and its courses
 * - `course-new`: a new course of a class (in the bar's dialog)
 * - `course`: one course's language and config sheet
 *
 * Every change goes through the API, which decides again on the server; these
 * elements only draw what it answers.
 */

import { confirmButton, defineExamElement, ExamApiError, ExamElement, examApi, format, h, markRows, saveOnChange, stickyColumns, t } from "./frame.js";
import "./date-input.js";

export const categoryLabels = {
  onlineTests: t("exam.categories.onlineTests"),
  manualTests: t("exam.categories.manualTests"),
  participation: t("exam.categories.participation"),
  homework: t("exam.categories.homework"),
};

const languageLabels = { de: t("exam.classes.languageGerman"), en: t("exam.classes.languageEnglish") };

/** A class name as people write it: `5ahif` → `5AHIF`. */
export function displayClass(name) {
  return name.toUpperCase();
}

/** A person's name for a list, family name first; the username where none is known. */
export function displayPerson(person) {
  const name = [person.familyName, person.givenName].filter(Boolean).join(" ");
  return name || person.username;
}

export function displayDate(iso) {
  return iso ? format.date(iso) : "";
}

/** Why an action failed, in a sentence for the teacher. */
function reason(error) {
  return error instanceof ExamApiError && error.status < 500
    ? error.message
    : t("exam.common.tryAgain");
}

/**
 * A line under a form that says what just happened. `report(text)` or
 * `report(text, true)` for a failure; an empty text clears it.
 */
export function messageLine() {
  const line = h("p", { class: "sl-exam-message", role: "status" });
  line.report = (text, failed = false) => {
    line.textContent = text;
    line.classList.toggle("sl-embed-error", failed);
  };
  return line;
}

/** Runs `action`, reports its failure on `line`, and keeps `button` disabled meanwhile. */
export async function act(button, line, action) {
  button.disabled = true;
  line.report("");
  try {
    await action();
  } catch (error) {
    line.report(reason(error), true);
  } finally {
    button.disabled = false;
  }
}

/**
 * A table in its own sideways-scrolling wrapper, its rows marked on click and
 * its first column - the one naming the row - kept in place.
 */
function conventionalTable(table) {
  for (const row of table.querySelectorAll("tr")) row.firstElementChild?.setAttribute("data-sticky", "0");
  markRows(table);
  stickyColumns(table);
  return h("div", { class: "sl-exam-scroll" }, table);
}

/** What the directory's state means for the teacher, or null when it is ready. */
function directoryNotice(state) {
  if (state === "unavailable") {
    return t("exam.classes.directoryUnavailable");
  }
  if (state === "loading") {
    return t("exam.classes.directoryLoading");
  }
  return null;
}

/** A suggestion for the school year after `years`' last one, or the one running now. */
function nextYearSuggestion(years) {
  const last = years.at(-1);
  const today = new Date();
  const first = last ? Number(last.name.slice(0, 4)) + 1 : today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  return {
    name: `${first}/${String((first + 1) % 100).padStart(2, "0")}`,
    startsOn: `${first}-09-01`,
    summerStartsOn: `${first + 1}-02-09`,
    endsOn: `${first + 1}-07-03`,
  };
}

// ------------------------------------------------------------------ the home

/** The module's pages that belong to no school year, so the home always offers them. */
function moduleLinks() {
  return h("p", { class: "sl-exam-quiet" }, h("a", { href: "/exam/scale" }, t("exam.pages.scale")), " · ", h("a", { href: "/exam/pool" }, t("exam.bar.pool")));
}

class ClassesHome extends ExamElement {
  async load() {
    const { years, current } = await examApi("/years");
    const selected = years.find((year) => String(year.id) === this.params.year) ?? current ?? years.at(-1) ?? null;
    const classes = selected ? await examApi(`/years/${selected.id}/classes`) : [];
    return { selected, classes };
  }

  render({ selected, classes }) {
    if (!selected) {
      return h(
        "div",
        { class: "sl-exam" },
        h("p", {}, t("exam.classes.noYear")),
        moduleLinks()
      );
    }
    const line = messageLine();
    const makeCurrent = selected.current
      ? null
      : h("button", {
          type: "button",
          onclick: (event) =>
            act(event.target, line, async () => {
              await examApi(`/years/${selected.id}/current`, { method: "POST" });
              window.location.reload();
            }),
        }, t("exam.classes.makeCurrent"));
    const table = classes.length
      ? conventionalTable(
          h(
            "table",
            { class: "sl-exam-table sl-exam-classes" },
            h("thead", {}, h("tr", {}, h("th", {}, t("exam.bar.class")), h("th", {}, t("exam.classes.students")), h("th", {}, t("exam.classes.courses")))),
            h(
              "tbody",
              {},
              classes.map((klass) =>
                h(
                  "tr",
                  {},
                  h("td", {}, h("a", { href: `/exam/classes/${klass.id}` }, displayClass(klass.name))),
                  h("td", {}, String(klass.students)),
                  h("td", {}, String(klass.courses))
                )
              )
            )
          )
        )
      : h("p", {}, t("exam.classes.noClasses"));
    return h(
      "div",
      { class: "sl-exam" },
      h("h2", {}, selected.current ? t("exam.classes.currentYearHeading", { name: selected.name }) : t("exam.classes.yearHeading", { name: selected.name }), " ", makeCurrent),
      h(
        "p",
        { class: "sl-exam-quiet" },
        t("exam.classes.yearDates", {
          start: displayDate(selected.startsOn),
          end: displayDate(selected.endsOn),
          summer: displayDate(selected.summerStartsOn),
        })
      ),
      line,
      table,
      moduleLinks()
    );
  }
}

// ------------------------------------------------------- a new school year

class YearNew extends ExamElement {
  async load() {
    return (await examApi("/years")).years;
  }

  render(years) {
    const suggestion = nextYearSuggestion(years);
    const line = messageLine();
    // Dates in the reader's format (`locale-formats`); the form sends their ISO values.
    const field = (label, name, type, value) =>
      h("label", {}, label, " ", type === "date" ? h("sl-date-input", { name, value, required: true }) : h("input", { name, type, value, required: true }));
    const form = h(
      "form",
      {
        class: "sl-exam-form",
        onsubmit: (event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(form));
          act(form.querySelector("button[type=submit]"), line, async () => {
            const year = await examApi("/years", { method: "POST", body: data });
            window.location.assign(`/exam/?year=${year.id}`);
          });
        },
      },
      field(t("exam.classes.name"), "name", "text", suggestion.name),
      field(t("exam.classes.starts"), "startsOn", "date", suggestion.startsOn),
      field(t("exam.classes.summerFrom"), "summerStartsOn", "date", suggestion.summerStartsOn),
      field(t("exam.classes.ends"), "endsOn", "date", suggestion.endsOn),
      h("button", { type: "submit", class: "sl-exam-primary" }, t("exam.classes.createYear"))
    );
    return h("div", { class: "sl-exam" }, form, line);
  }
}

// ------------------------------------------------------------- a new class

/**
 * A checklist of people with nobody ticked, plus a way to tick everyone, and
 * the usernames of everyone ticked.
 */
function checklist(people) {
  const boxes = people.map((person) =>
    h("input", { type: "checkbox", value: person.username, "aria-label": displayPerson(person) })
  );
  const list = h(
    "ul",
    { class: "sl-exam-checklist" },
    people.map((person, index) =>
      h("li", {}, h("label", {}, boxes[index], " ", displayPerson(person), " ", h("span", { class: "sl-exam-quiet" }, person.username)))
    )
  );
  list.ticked = () => boxes.filter((box) => box.checked).map((box) => box.value);
  list.tickAll = (checked) => boxes.forEach((box) => (box.checked = checked));
  list.addPerson = (person) => {
    const box = h("input", { type: "checkbox", value: person.username, checked: true, "aria-label": displayPerson(person) });
    boxes.push(box);
    list.append(h("li", {}, h("label", {}, box, " ", displayPerson(person), " ", h("span", { class: "sl-exam-quiet" }, person.username))));
  };
  list.has = (username) => boxes.some((box) => box.value === username);
  return list;
}

class ClassNew extends ExamElement {
  async load() {
    const yearId = this.params.year;
    const [{ years }, directory] = await Promise.all([examApi("/years"), examApi("/directory/classes")]);
    const year = years.find((candidate) => String(candidate.id) === yearId);
    if (!year) throw new ExamApiError(404);
    return { year, directory };
  }

  render({ year, directory }) {
    const line = messageLine();
    const notice = directoryNotice(directory.state);
    const names = h("datalist", { id: "sl-exam-class-names" }, (directory.classes ?? []).map((name) => h("option", { value: displayClass(name) })));
    const nameInput = h("input", { name: "name", list: "sl-exam-class-names", required: true, placeholder: "5AHIF" });
    const members = h("div", {});
    let list = checklist([]);
    members.append(list);

    const showMembers = (event) =>
      act(event.target, line, async () => {
        const name = nameInput.value.trim().toLowerCase();
        if (!name) return;
        const answer = await examApi(`/directory/classes/${encodeURIComponent(name)}`);
        const waiting = directoryNotice(answer.state);
        list = checklist(answer.candidates ?? []);
        members.replaceChildren(
          waiting
            ? h("p", { class: "sl-exam-quiet" }, waiting)
            : h("p", {}, t("exam.classes.directoryMembers", { count: answer.candidates.length, name: displayClass(name) })),
          answer.candidates?.length ? h("p", {}, h("button", { type: "button", onclick: () => list.tickAll(true) }, t("exam.classes.tickAll")), " ", h("button", { type: "button", onclick: () => list.tickAll(false) }, t("exam.classes.untickAll"))) : null,
          list
        );
      });

    const extra = h("input", { placeholder: t("exam.classes.usernamePlaceholder"), "aria-label": t("exam.classes.addByUsernameLabel") });
    const addExtra = () => {
      const username = extra.value.trim().toLowerCase();
      if (!username || list.has(username)) return;
      list.addPerson({ username });
      extra.value = "";
    };

    const create = (event) =>
      act(event.target, line, async () => {
        const klass = await examApi(`/years/${year.id}/classes`, {
          method: "POST",
          body: { name: nameInput.value, students: list.ticked() },
        });
        window.location.assign(`/exam/classes/${klass.id}`);
      });

    return h(
      "div",
      { class: "sl-exam" },
      h("p", {}, t("exam.classes.yearSentence", { name: year.name })),
      notice ? h("p", { class: "sl-exam-quiet" }, notice) : null,
      h("p", {}, h("label", {}, t("exam.bar.class"), " ", nameInput), names, " ", h("button", { type: "button", onclick: showMembers }, t("exam.classes.showMembers"))),
      members,
      h("p", {}, extra, " ", h("button", { type: "button", onclick: addExtra }, t("exam.classes.addByUsername"))),
      h("p", {}, h("button", { type: "button", class: "sl-exam-primary", onclick: create }, t("exam.classes.createClass"))),
      line
    );
  }
}

// -------------------------------------------------------------- one class

class ClassView extends ExamElement {
  async load() {
    const klass = await examApi(`/classes/${encodeURIComponent(this.params.class)}`);
    const directory = await examApi(`/directory/classes/${encodeURIComponent(klass.name)}`);
    return { klass, directory };
  }

  render({ klass, directory }) {
    const heading = document.querySelector("#markdown-content h1");
    if (heading) heading.textContent = t("exam.classes.classHeading", { name: displayClass(klass.name), year: klass.year.name });
    return h("div", { class: "sl-exam" }, this.rosterSection(klass), this.addSection(klass, directory), this.courseSection(klass));
  }

  rosterSection(klass) {
    const line = messageLine();
    const attending = klass.roster.filter((entry) => !entry.leftAt);
    const left = klass.roster.filter((entry) => entry.leftAt);
    const remove = (entry) => (event) => {
      act(event.target, line, async () => {
        await examApi(`/classes/${klass.id}/roster/${encodeURIComponent(entry.username)}`, { method: "DELETE" });
        this.reload();
      });
    };
    const refresh = (event) =>
      act(event.target, line, async () => {
        const answer = await examApi(`/classes/${klass.id}/names`, { method: "POST" });
        const waiting = directoryNotice(answer.state);
        if (waiting) {
          line.report(waiting);
          return;
        }
        await this.reload();
      });
    const rows = (entries, removable) =>
      entries.map((entry) =>
        h(
          "tr",
          { class: entry.leftAt ? "sl-exam-left" : null },
          h("td", {}, displayPerson(entry)),
          h("td", {}, entry.username),
          h("td", {}, entry.leftAt ? t("exam.classes.leftOn", { date: displayDate(entry.leftAt) }) : t("exam.classes.since", { date: displayDate(entry.joinedAt) })),
          h("td", {}, removable
            ? confirmButton({
                class: "sl-exam-roster-remove",
                label: t("exam.classes.remove"),
                armed: t("exam.classes.removeArmed", { name: displayPerson(entry) }),
                action: remove(entry),
              })
            : null)
        )
      );
    return h(
      "section",
      {},
      h("h2", {}, t("exam.classes.roster", { number: attending.length })),
      attending.length
        ? conventionalTable(h("table", { class: "sl-exam-table sl-exam-roster" }, h("tbody", {}, rows(attending, true))))
        : h("p", {}, t("exam.classes.rosterEmpty")),
      left.length ? h("h3", {}, t("exam.classes.leftRoster", { number: left.length })) : null,
      left.length ? conventionalTable(h("table", { class: "sl-exam-table sl-exam-roster" }, h("tbody", {}, rows(left, false)))) : null,
      h("p", {}, h("button", { type: "button", onclick: refresh }, t("exam.classes.refreshNames"))),
      line
    );
  }

  addSection(klass, directory) {
    const line = messageLine();
    const onRoster = new Set(klass.roster.filter((entry) => !entry.leftAt).map((entry) => entry.username));
    const add = (username) => (event) =>
      act(event.target, line, async () => {
        await examApi(`/classes/${klass.id}/roster`, { method: "POST", body: { username } });
        this.reload();
      });
    const personRow = (person) =>
      h("li", {}, displayPerson(person), " ", h("span", { class: "sl-exam-quiet" }, person.username), " ", h("button", { type: "button", onclick: add(person.username) }, t("exam.classes.add")));

    const notice = directoryNotice(directory.state);
    const missing = (directory.candidates ?? []).filter((person) => !onRoster.has(person.username));
    const unit = notice
      ? h("p", { class: "sl-exam-quiet" }, notice)
      : missing.length
        ? h("details", {}, h("summary", {}, t("exam.classes.missingMembers", { count: missing.length, name: displayClass(klass.name) })), h("ul", { class: "sl-exam-checklist" }, missing.map(personRow)))
        : h("p", { class: "sl-exam-quiet" }, t("exam.classes.everyoneOnRoster", { name: displayClass(klass.name) }));

    const results = h("ul", { class: "sl-exam-checklist" });
    const query = h("input", { type: "search", placeholder: t("exam.classes.searchPlaceholder"), "aria-label": t("exam.classes.searchLabel") });
    const search = (event) =>
      act(event.target, line, async () => {
        const answer = await examApi(`/directory/people?q=${encodeURIComponent(query.value)}`);
        const waiting = directoryNotice(answer.state);
        results.replaceChildren(
          ...(waiting
            ? [h("li", { class: "sl-exam-quiet" }, waiting)]
            : answer.people.length
              ? answer.people.filter((person) => !onRoster.has(person.username)).map(personRow)
              : [h("li", { class: "sl-exam-quiet" }, t("exam.classes.nobodyFound"))])
        );
      });
    const username = h("input", { placeholder: t("exam.classes.usernamePlaceholder"), "aria-label": t("exam.classes.addByUsernameLabel") });

    return h(
      "section",
      {},
      h("h2", {}, t("exam.classes.addStudents")),
      unit,
      h("p", {}, query, " ", h("button", { type: "button", onclick: search }, t("exam.classes.searchDirectory"))),
      results,
      h("p", {}, username, " ", h("button", { type: "button", onclick: (event) => add(username.value.trim())(event) }, t("exam.classes.addByUsername"))),
      line
    );
  }

  courseSection(klass) {
    return h(
      "section",
      {},
      h("h2", {}, t("exam.classes.courses")),
      klass.courses.length
        ? h("ul", {}, klass.courses.map((course) => h("li", {}, h("a", { href: `/exam/courses/${course.id}` }, course.subject), ` (${languageLabels[course.language]}) · `, h("a", { href: `/exam/courses/${course.id}/gradebook` }, t("exam.pages.gradebook")))))
        : h("p", {}, t("exam.classes.noCourses"))
    );
  }
}

// ------------------------------------------------------------- a new course

class CourseNew extends ExamElement {
  async load() {
    return examApi(`/classes/${encodeURIComponent(this.params.class)}`);
  }

  render(klass) {
    const line = messageLine();
    const subject = h("input", { name: "subject", required: true, placeholder: "WMC", "aria-label": t("exam.classes.subject") });
    const language = h("select", { name: "language", "aria-label": t("exam.classes.language") }, Object.entries(languageLabels).map(([value, label]) => h("option", { value }, label)));
    const form = h(
      "form",
      {
        class: "sl-exam-form",
        onsubmit: (event) => {
          event.preventDefault();
          act(form.querySelector("button"), line, async () => {
            const course = await examApi(`/classes/${klass.id}/courses`, {
              method: "POST",
              body: { subject: subject.value, language: language.value },
            });
            window.location.assign(`/exam/courses/${course.id}`);
          });
        },
      },
      h("p", {}, t("exam.classes.classHeading", { name: displayClass(klass.name), year: klass.year.name })),
      h("label", {}, t("exam.classes.subject"), " ", subject),
      h("label", {}, t("exam.classes.language"), " ", language),
      h("button", { type: "submit", class: "sl-exam-primary" }, t("exam.classes.createCourse"))
    );
    return h("div", { class: "sl-exam" }, form, line);
  }
}

// ------------------------------------------------------------- one course

class CourseView extends ExamElement {
  async load() {
    return examApi(`/courses/${encodeURIComponent(this.params.course)}`);
  }

  /**
   * The course's language and config sheet, each saved as it changes. The
   * weights are saved together, and only while they add up to 100 %; until
   * then the sum says what is missing.
   */
  render(course) {
    const heading = document.querySelector("#markdown-content h1");
    if (heading) heading.textContent = `${course.subject} – ${displayClass(course.className)} – ${course.year.name}`;
    const put = (body) => examApi(`/courses/${course.id}`, { method: "PUT", body });
    const language = h("select", { "aria-label": t("exam.classes.language") }, Object.entries(languageLabels).map(([value, label]) => h("option", { value, selected: value === course.language }, label)));
    saveOnChange(language, { save: (value) => put({ language: value }) });

    const sum = h("span", {});
    const inputs = Object.fromEntries(
      course.categories.map((category) => [
        category,
        h("input", { type: "number", min: "0", max: "100", step: "1", value: String(course.weights[category]), "aria-label": categoryLabels[category] }),
      ])
    );
    const weights = () => Object.fromEntries(Object.entries(inputs).map(([category, input]) => [category, Number(input.value)]));
    const total = () => Object.values(weights()).reduce((a, b) => a + b, 0);
    const updateSum = () => {
      sum.textContent = total() === 100 ? t("exam.classes.weightsComplete") : t("exam.classes.weightsIncomplete", { sum: total() });
      sum.classList.toggle("sl-embed-error", total() !== 100);
    };
    Object.values(inputs).forEach((input) => input.addEventListener("input", updateSum));
    updateSum();
    const sheet = h(
      "table",
      { class: "sl-exam-table sl-exam-config" },
      h("tbody", {}, course.categories.map((category) => h("tr", {}, h("td", {}, categoryLabels[category]), h("td", {}, inputs[category], " %"))))
    );
    // One save for the four fields: their `change` events reach the table.
    saveOnChange(sheet, {
      value: () => JSON.stringify(weights()),
      check: () => (total() === 100 ? null : t("exam.classes.weightsWrong", { sum: total() })),
      save: () => put({ weights: weights() }),
    });

    const share = h("input", { type: "number", min: "0", max: "100", step: "1", class: "sl-exam-number", value: String(course.winterShare), "aria-label": t("exam.classes.winterShareLabel") });
    saveOnChange(share, {
      check: (value) => (/^\d+$/.test(value) && Number(value) <= 100 ? null : t("exam.classes.wholePercentage")),
      save: (value) => put({ winterShare: Number(value) }),
    });

    return h(
      "div",
      { class: "sl-exam" },
      h("p", { class: "sl-exam-quiet" }, t("exam.classes.savedAsChanged")),
      h("p", {}, h("label", {}, t("exam.classes.presentedIn"), " ", language)),
      h("h2", {}, t("exam.classes.configSheet")),
      h("p", { class: "sl-exam-quiet" }, t("exam.classes.configExplanation")),
      conventionalTable(sheet),
      h("p", {}, sum),
      h("h2", {}, t("exam.classes.yearGrade")),
      h(
        "p",
        {},
        h("label", {}, t("exam.classes.winterCountsBefore"), " ", share, " ", t("exam.classes.winterCountsAfter")),
        h("br"),
        h("span", { class: "sl-exam-quiet" }, t("exam.classes.summerCountsRest"))
      ),
      h("p", {}, h("a", { href: `/exam/courses/${course.id}/gradebook` }, t("exam.classes.openGradebook")))
    );
  }
}

defineExamElement("classes-home", ClassesHome);
defineExamElement("year-new", YearNew);
defineExamElement("class-new", ClassNew);
defineExamElement("class", ClassView);
defineExamElement("course-new", CourseNew);
defineExamElement("course", CourseView);
