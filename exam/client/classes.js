/**
 * The elements of classes and courses (`class-roster`), all for teachers:
 *
 * - `classes-home`: the school years, the classes of one of them, a new year
 * - `class-new`: a new class, its roster ticked from the directory's checklist
 * - `class`: one class's roster during the year, and its courses
 * - `course`: one course's language and config sheet
 *
 * Every change goes through the API, which decides again on the server; these
 * elements only draw what it answers.
 */

import { defineExamElement, ExamApiError, ExamElement, examApi, h } from "./frame.js";

const categoryLabels = {
  onlineTests: "Online tests",
  manualTests: "Manual tests",
  participation: "Participation (+/−)",
  homework: "Homework",
};

const languageLabels = { de: "German", en: "English" };

/** A class name as people write it: `5ahif` → `5AHIF`. */
function displayClass(name) {
  return name.toUpperCase();
}

/** A person's name for a list, family name first; the username where none is known. */
function displayPerson(person) {
  const name = [person.familyName, person.givenName].filter(Boolean).join(" ");
  return name || person.username;
}

function displayDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : "";
}

/** Why an action failed, in a sentence for the teacher. */
function reason(error) {
  return error instanceof ExamApiError && error.status < 500
    ? error.message
    : "That did not work. Please try again.";
}

/**
 * A line under a form that says what just happened. `report(text)` or
 * `report(text, true)` for a failure; an empty text clears it.
 */
function messageLine() {
  const line = h("p", { class: "sl-exam-message", role: "status" });
  line.report = (text, failed = false) => {
    line.textContent = text;
    line.classList.toggle("sl-embed-error", failed);
  };
  return line;
}

/** Runs `action`, reports its failure on `line`, and keeps `button` disabled meanwhile. */
async function act(button, line, action) {
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

/** What the directory's state means for the teacher, or null when it is ready. */
function directoryNotice(state) {
  if (state === "unavailable") {
    return "The directory is not available on this instance. Add students by their username.";
  }
  if (state === "loading") {
    return "The directory is still being loaded. Try again in a moment, or add students by their username.";
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

class ClassesHome extends ExamElement {
  async load() {
    const { years, current } = await examApi("/years");
    const selected = years.find((year) => String(year.id) === this.selectedYear) ?? current ?? years.at(-1) ?? null;
    const classes = selected ? await examApi(`/years/${selected.id}/classes`) : [];
    return { years, selected, classes };
  }

  render({ years, selected, classes }) {
    return h(
      "div",
      { class: "sl-exam" },
      selected ? this.yearSection(years, selected, classes) : h("p", {}, "There is no school year yet. Create the first one below."),
      this.newYearForm(years)
    );
  }

  yearSection(years, selected, classes) {
    const line = messageLine();
    const picker = h(
      "select",
      {
        "aria-label": "School year",
        onchange: (event) => {
          this.selectedYear = event.target.value;
          this.reload();
        },
      },
      years.map((year) =>
        h("option", { value: String(year.id), selected: year.id === selected.id }, year.current ? `${year.name} (current)` : year.name)
      )
    );
    const makeCurrent = selected.current
      ? null
      : h("button", {
          type: "button",
          onclick: (event) =>
            act(event.target, line, async () => {
              await examApi(`/years/${selected.id}/current`, { method: "POST" });
              this.reload();
            }),
        }, "Make current");
    const table = classes.length
      ? h(
          "table",
          { class: "sl-exam-table" },
          h("thead", {}, h("tr", {}, h("th", {}, "Class"), h("th", {}, "Students"), h("th", {}, "Courses"))),
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
      : h("p", {}, "This school year has no classes yet.");
    return h(
      "section",
      {},
      h("h2", {}, "School year ", picker, " ", makeCurrent),
      h(
        "p",
        { class: "sl-exam-quiet" },
        `${displayDate(selected.startsOn)} – ${displayDate(selected.endsOn)}, summer semester from ${displayDate(selected.summerStartsOn)}`
      ),
      line,
      table,
      h("p", {}, h("a", { href: `/exam/classes/new?year=${selected.id}` }, "New class…"))
    );
  }

  newYearForm(years) {
    const suggestion = nextYearSuggestion(years);
    const line = messageLine();
    const field = (label, name, type, value) =>
      h("label", {}, label, " ", h("input", { name, type, value, required: true }));
    const form = h(
      "form",
      {
        class: "sl-exam-form",
        onsubmit: (event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(form));
          act(form.querySelector("button"), line, async () => {
            const year = await examApi("/years", { method: "POST", body: data });
            this.selectedYear = String(year.id);
            this.reload();
          });
        },
      },
      field("Name", "name", "text", suggestion.name),
      field("Starts", "startsOn", "date", suggestion.startsOn),
      field("Summer semester from", "summerStartsOn", "date", suggestion.summerStartsOn),
      field("Ends", "endsOn", "date", suggestion.endsOn),
      h("button", { type: "submit" }, "Create school year")
    );
    return h("section", {}, h("h2", {}, "New school year"), form, line);
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
            : h("p", {}, `${answer.candidates.length} member(s) of ${displayClass(name)} in the directory. Tick those who attend this year.`),
          answer.candidates?.length ? h("p", {}, h("button", { type: "button", onclick: () => list.tickAll(true) }, "Tick all"), " ", h("button", { type: "button", onclick: () => list.tickAll(false) }, "Untick all")) : null,
          list
        );
      });

    const extra = h("input", { placeholder: "username", "aria-label": "Add a student by username" });
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
      h("p", {}, `School year ${year.name}.`),
      notice ? h("p", { class: "sl-exam-quiet" }, notice) : null,
      h("p", {}, h("label", {}, "Class ", nameInput), names, " ", h("button", { type: "button", onclick: showMembers }, "Show members")),
      members,
      h("p", {}, extra, " ", h("button", { type: "button", onclick: addExtra }, "Add by username")),
      h("p", {}, h("button", { type: "button", class: "sl-exam-primary", onclick: create }, "Create class with the ticked students")),
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
    if (heading) heading.textContent = `Class ${displayClass(klass.name)} – ${klass.year.name}`;
    return h("div", { class: "sl-exam" }, this.rosterSection(klass), this.addSection(klass, directory), this.courseSection(klass));
  }

  rosterSection(klass) {
    const line = messageLine();
    const attending = klass.roster.filter((entry) => !entry.leftAt);
    const left = klass.roster.filter((entry) => entry.leftAt);
    const remove = (entry) => (event) => {
      if (!window.confirm(`Take ${displayPerson(entry)} off the roster? What is recorded for them stays.`)) return;
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
          h("td", {}, entry.leftAt ? `left ${displayDate(entry.leftAt)}` : `since ${displayDate(entry.joinedAt)}`),
          h("td", {}, removable ? h("button", { type: "button", onclick: remove(entry) }, "Remove") : null)
        )
      );
    return h(
      "section",
      {},
      h("h2", {}, `Roster (${attending.length})`),
      attending.length
        ? h("table", { class: "sl-exam-table sl-exam-roster" }, h("tbody", {}, rows(attending, true)))
        : h("p", {}, "Nobody is on this roster."),
      left.length ? h("h3", {}, `Left the roster (${left.length})`) : null,
      left.length ? h("table", { class: "sl-exam-table sl-exam-roster" }, h("tbody", {}, rows(left, false))) : null,
      h("p", {}, h("button", { type: "button", onclick: refresh }, "Refresh names from the directory")),
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
      h("li", {}, displayPerson(person), " ", h("span", { class: "sl-exam-quiet" }, person.username), " ", h("button", { type: "button", onclick: add(person.username) }, "Add"));

    const notice = directoryNotice(directory.state);
    const missing = (directory.candidates ?? []).filter((person) => !onRoster.has(person.username));
    const unit = notice
      ? h("p", { class: "sl-exam-quiet" }, notice)
      : missing.length
        ? h("details", {}, h("summary", {}, `${missing.length} member(s) of ${displayClass(klass.name)} in the directory are not on the roster`), h("ul", { class: "sl-exam-checklist" }, missing.map(personRow)))
        : h("p", { class: "sl-exam-quiet" }, `Everyone in ${displayClass(klass.name)}'s directory unit is on the roster.`);

    const results = h("ul", { class: "sl-exam-checklist" });
    const query = h("input", { type: "search", placeholder: "name or username", "aria-label": "Search the whole directory" });
    const search = (event) =>
      act(event.target, line, async () => {
        const answer = await examApi(`/directory/people?q=${encodeURIComponent(query.value)}`);
        const waiting = directoryNotice(answer.state);
        results.replaceChildren(
          ...(waiting
            ? [h("li", { class: "sl-exam-quiet" }, waiting)]
            : answer.people.length
              ? answer.people.filter((person) => !onRoster.has(person.username)).map(personRow)
              : [h("li", { class: "sl-exam-quiet" }, "Nobody found.")])
        );
      });
    const username = h("input", { placeholder: "username", "aria-label": "Add a student by username" });

    return h(
      "section",
      {},
      h("h2", {}, "Add students"),
      unit,
      h("p", {}, query, " ", h("button", { type: "button", onclick: search }, "Search the directory")),
      results,
      h("p", {}, username, " ", h("button", { type: "button", onclick: (event) => add(username.value.trim())(event) }, "Add by username")),
      line
    );
  }

  courseSection(klass) {
    const line = messageLine();
    const subject = h("input", { name: "subject", required: true, placeholder: "WMC", "aria-label": "Subject" });
    const language = h("select", { name: "language", "aria-label": "Language" }, Object.entries(languageLabels).map(([value, label]) => h("option", { value }, label)));
    const create = (event) =>
      act(event.target, line, async () => {
        const course = await examApi(`/classes/${klass.id}/courses`, {
          method: "POST",
          body: { subject: subject.value, language: language.value },
        });
        window.location.assign(`/exam/courses/${course.id}`);
      });
    return h(
      "section",
      {},
      h("h2", {}, "Courses"),
      klass.courses.length
        ? h("ul", {}, klass.courses.map((course) => h("li", {}, h("a", { href: `/exam/courses/${course.id}` }, course.subject), ` (${languageLabels[course.language]})`)))
        : h("p", {}, "This class has no courses yet."),
      h("p", {}, subject, " ", language, " ", h("button", { type: "button", onclick: create }, "Create course")),
      line
    );
  }
}

// ------------------------------------------------------------- one course

class CourseView extends ExamElement {
  async load() {
    return examApi(`/courses/${encodeURIComponent(this.params.course)}`);
  }

  render(course) {
    const heading = document.querySelector("#markdown-content h1");
    if (heading) heading.textContent = `${course.subject} – ${displayClass(course.className)} – ${course.year.name}`;
    const line = messageLine();
    const language = h("select", { "aria-label": "Language" }, Object.entries(languageLabels).map(([value, label]) => h("option", { value, selected: value === course.language }, label)));
    const sum = h("span", {});
    const inputs = Object.fromEntries(
      course.categories.map((category) => [
        category,
        h("input", { type: "number", min: "0", max: "100", step: "1", value: String(course.weights[category]), "aria-label": categoryLabels[category] }),
      ])
    );
    const weights = () => Object.fromEntries(Object.entries(inputs).map(([category, input]) => [category, Number(input.value)]));
    const updateSum = () => {
      const total = Object.values(weights()).reduce((a, b) => a + b, 0);
      sum.textContent = `Together ${total} %`;
      sum.classList.toggle("sl-embed-error", total !== 100);
    };
    Object.values(inputs).forEach((input) => input.addEventListener("input", updateSum));
    updateSum();
    const save = (event) =>
      act(event.target, line, async () => {
        await examApi(`/courses/${course.id}`, { method: "PUT", body: { language: language.value, weights: weights() } });
        line.report("Saved.");
      });
    return h(
      "div",
      { class: "sl-exam" },
      h("p", {}, h("a", { href: `/exam/classes/${course.classId}` }, `Class ${displayClass(course.className)}`)),
      h("p", {}, h("label", {}, "Tests are presented in ", language)),
      h("h2", {}, "Config sheet"),
      h("p", { class: "sl-exam-quiet" }, "How much each category counts towards the semester grade. A category without entries is left out and the others are scaled up."),
      h(
        "table",
        { class: "sl-exam-table" },
        h("tbody", {}, course.categories.map((category) => h("tr", {}, h("td", {}, categoryLabels[category]), h("td", {}, inputs[category], " %"))))
      ),
      h("p", {}, sum),
      h("p", {}, h("button", { type: "button", class: "sl-exam-primary", onclick: save }, "Save")),
      line
    );
  }
}

defineExamElement("classes-home", ClassesHome);
defineExamElement("class-new", ClassNew);
defineExamElement("class", ClassView);
defineExamElement("course", CourseView);
