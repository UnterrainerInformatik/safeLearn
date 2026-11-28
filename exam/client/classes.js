/**
 * The elements of classes and courses (`class-roster`), all for teachers:
 *
 * - `classes-home`: the classes of one school year, the one the bar chose
 * - `year-new`: a new school year (in the bar's dialog)
 * - `class-new`: a new class, its roster ticked from the directory's checklist
 *   (in the bar's dialog)
 * - `class`: one class's teachers, its roster during the year, and its courses
 * - `course-new`: a new course of a class (in the bar's dialog)
 * - `course`: one course's language and config sheet
 *
 * Every change goes through the API, which decides again on the server; these
 * elements only draw what it answers. What only an admin may do - creating,
 * renaming and deleting a class, the year change's class step, the class's
 * teachers (`class-teachers`) - is offered only while `/me` says admin.
 */

import { button, confirmButton, defineExamElement, ExamApiError, ExamElement, examApi, examMe, format, h, linkButton, markRows, readOnlyFor, saveOnChange, stickyColumns, t } from "./frame.js";
import { openCreatorOf } from "./bar.js";
import { viennaLocal } from "./periods.js";
import "./date-input.js";

export const categoryLabels = {
  onlineTests: t("exam.categories.onlineTests"),
  manualTests: t("exam.categories.manualTests"),
  shortTests: t("exam.categories.shortTests"),
  presentations: t("exam.categories.presentations"),
  projects: t("exam.categories.projects"),
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

/**
 * What marks a course's Matura candidate (`exam-participant-role`): the class
 * that colours the cell or the name, and `text` on hover. `candidateNote`
 * says the same to assistive technology, so the colour is never the only
 * carrier.
 */
export function candidateMark(text = t("exam.participant.candidate")) {
  return { class: "sl-exam-participant", title: text };
}

export function candidateNote(text = t("exam.participant.candidate")) {
  return h("span", { class: "sl-exam-visually-hidden" }, ` (${text})`);
}

/** A person's name as `displayPerson` writes it, coloured and labelled when they are a candidate. */
export function personName(person, candidate = person?.examParticipant === true) {
  return candidate ? h("span", candidateMark(), displayPerson(person), candidateNote()) : displayPerson(person);
}

/** The initials of a person's family and given name, family first as the lists write them; from the username without names. */
export function personInitials(person) {
  const first = (value) => (typeof value === "string" ? [...value.trim()][0] ?? "" : "");
  const initials = `${first(person.familyName)}${first(person.givenName)}`;
  return (initials || (person.username ?? "").slice(0, 2)).toUpperCase();
}

/**
 * The person's photo, or their initials in the same place and size
 * (`student-photos`, design D3). `person.photo` is the version the payload
 * carries for a session holding `student-images`; without it the initials
 * stand there. The image's `alt` is empty, because the name stands right
 * beside it; hovering or focusing the wrapper shows it at its stored size
 * (`enlargePhotos`).
 */
export function personBadge(person) {
  if (typeof person?.photo === "string" && person.photo.length > 0) {
    enlargePhotos();
    return h(
      "span",
      { class: "sl-exam-person-photo", tabindex: "0" },
      h("img", {
        src: `/exam/photos/${encodeURIComponent(person.username)}?v=${encodeURIComponent(person.photo)}`,
        alt: "",
        loading: "lazy",
        decoding: "async",
      })
    );
  }
  // Drawn by CSS from the attribute, so a row's text stays the name alone.
  return h("span", { class: "sl-exam-person-initials", "aria-hidden": "true", "data-initials": personInitials(person ?? {}) });
}

let photoLayer = null;

/**
 * Shows a hovered or focused photo at its stored size, beside its box
 * (`student-photos`, design D3). The enlarged image is one element of its
 * own at the end of the content, placed by the box's position in the
 * viewport and kept inside it. A layer inside the row cannot do this: the
 * sheet's sticky name cells each form a stacking context, so the next row
 * paints over it, and Chrome places a `position: fixed` image without insets
 * at its static position in document coordinates, so it drifts down by
 * however far the page is scrolled. Installed once, on the first photo.
 */
function enlargePhotos() {
  if (photoLayer !== null || typeof document === "undefined") return;
  photoLayer = { image: null, box: null };
  const gap = 6;
  const hide = () => {
    photoLayer.box = null;
    photoLayer.image?.remove();
  };
  const place = () => {
    const { box, image } = photoLayer;
    if (box === null || image === null) return;
    if (!box.isConnected) return hide();
    const anchor = box.getBoundingClientRect();
    const width = image.offsetWidth;
    const height = image.offsetHeight;
    let left = anchor.right + gap;
    if (left + width > window.innerWidth - gap) left = Math.max(gap, anchor.left - gap - width);
    const top = Math.min(Math.max(gap, anchor.top), Math.max(gap, window.innerHeight - gap - height));
    image.style.left = `${Math.round(left)}px`;
    image.style.top = `${Math.round(top)}px`;
  };
  const show = (box) => {
    const source = box.querySelector("img");
    if (source === null) return;
    photoLayer.box = box;
    const host = box.closest("#markdown-content") ?? document.body;
    photoLayer.image ??= Object.assign(document.createElement("img"), { className: "sl-exam-photo-enlarged", alt: "" });
    const image = photoLayer.image;
    image.onload = place;
    if (image.src !== source.src) image.src = source.src;
    if (image.parentNode !== host) host.append(image);
    place();
  };
  const boxOf = (event) => (event.target instanceof Element ? event.target.closest(".sl-exam-person-photo") : null);
  document.addEventListener("pointerover", (event) => {
    const box = boxOf(event);
    if (box !== null && box !== photoLayer.box) show(box);
  });
  document.addEventListener("pointerout", (event) => {
    const box = boxOf(event);
    if (box !== null && !box.contains(event.relatedTarget) && document.activeElement !== box) hide();
  });
  document.addEventListener("focusin", (event) => {
    const box = boxOf(event);
    if (box !== null && box.matches(":focus-visible")) show(box);
  });
  document.addEventListener("focusout", (event) => {
    if (boxOf(event) === photoLayer.box) hide();
  });
  window.addEventListener("scroll", place, { capture: true, passive: true });
  window.addEventListener("resize", place, { passive: true });
}

/**
 * A person in a list: the photo or initials, then the name as `personName`
 * writes it, a Matura candidate's marking included. `name` replaces the name
 * where the place draws its own - a link, or a heading's text; `candidate`
 * false leaves the marking to the place, where its cell carries it.
 */
export function personLabel(person, { candidate = person?.examParticipant === true, name = null } = {}) {
  return h("span", { class: "sl-exam-person" }, personBadge(person), h("span", { class: "sl-exam-person-name" }, name ?? personName(person, candidate)));
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
 * Rename and Delete in a record's head (`exam-record-maintenance`): Rename
 * opens an inline field with Save and Cancel, Delete asks by a second click.
 * A refusal of either is told right beside the buttons. `rename(name)` and
 * `remove()` send the request and go where the page then belongs - a reload,
 * so the bar shows the new state too.
 */
export function recordActions({ name, label, rename, remove, armed, className = "" }) {
  const line = messageLine();
  const field = h("input", { type: "text", value: name, "aria-label": label, required: true, maxlength: "80" });
  const buttons = h(
    "span",
    { class: "sl-exam-actions" },
    button({ label: t("exam.records.rename"), class: "sl-exam-record-rename", action: () => editing(true) }),
    confirmButton({
      class: "sl-exam-record-delete",
      label: t("exam.records.delete"),
      armed,
      action: (event) => act(event.target, line, remove),
    })
  );
  const form = h(
    "form",
    {
      class: "sl-exam-actions sl-exam-record-form",
      hidden: true,
      onSubmit: (event) => {
        event.preventDefault();
        act(form.querySelector("button[type=submit]"), line, () => rename(field.value));
      },
      onKeydown: (event) => {
        if (event.key === "Escape") editing(false);
      },
    },
    field,
    button({ label: t("exam.records.save"), kind: "primary", type: "submit" }),
    button({ label: t("exam.records.cancel"), class: "sl-exam-record-cancel", action: () => editing(false) })
  );
  const editing = (on) => {
    form.hidden = !on;
    buttons.hidden = on;
    line.report("");
    if (on) {
      field.value = name;
      field.focus();
      field.select();
    }
  };
  return h("div", { class: `sl-exam-record-actions ${className}` }, buttons, form, line);
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
export function directoryNotice(state) {
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

class ClassesHome extends ExamElement {
  async load() {
    const [{ years, current }, me] = await Promise.all([examApi("/years"), examMe()]);
    const selected = years.find((year) => String(year.id) === this.params.year) ?? current ?? years.at(-1) ?? null;
    const classes = selected ? await examApi(`/years/${selected.id}/classes`) : [];
    // Starting the next year creates classes: an admin's (class-bound-teachers, task 3.3).
    const next = me.admin && selected && !selected.closed ? await examApi(`/years/${selected.id}/next-classes`) : null;
    const retention = selected?.current ? await examApi("/retention") : null;
    return { selected, classes, next, retention, admin: me.admin };
  }

  render({ selected, classes, next, retention, admin }) {
    if (!selected) {
      return h(
        "div",
        { class: "sl-exam" },
        h("p", {}, t("exam.classes.noYear")),
        h("p", {}, button({ label: t("exam.classes.createYear"), kind: "primary", class: "sl-exam-year-create", action: () => openCreatorOf("year") }))
      );
    }
    const line = messageLine();
    const makeCurrent = selected.current || selected.closed
      ? null
      : h("button", {
          type: "button",
          class: "sl-exam-action sl-exam-action-primary",
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
            h(
              "thead",
              {},
              h(
                "tr",
                {},
                h("th", {}, t("exam.bar.class")),
                h("th", {}, t("exam.classes.students")),
                h("th", {}, t("exam.classes.courses")),
                admin ? h("th", {}, t("exam.classes.teachers")) : null
              )
            ),
            h(
              "tbody",
              {},
              // For an admin the server lists the classes without teachers first (class-bound-teachers D8).
              classes.map((klass) =>
                h(
                  "tr",
                  { class: admin && klass.teacherCount === 0 ? "sl-exam-no-teachers" : null },
                  h("td", {}, h("a", { href: `/exam/classes/${klass.id}` }, displayClass(klass.name))),
                  h("td", {}, String(klass.students)),
                  h("td", {}, String(klass.courses)),
                  admin
                    ? h(
                        "td",
                        { class: "sl-exam-teacher-count" },
                        klass.teacherCount === 0
                          ? h("span", { class: "sl-exam-no-teachers-mark" }, t("exam.classes.noTeachers"))
                          : t("exam.classes.teacherCount", { count: klass.teacherCount })
                      )
                    : null
                )
              )
            )
          )
        )
      : h("p", {}, t("exam.classes.noClasses"));
    const yearActions = recordActions({
      name: selected.name,
      label: t("exam.records.yearName"),
      armed: t("exam.records.deleteYearArmed", { name: selected.name }),
      className: "sl-exam-year-actions",
      rename: async (name) => {
        await examApi(`/years/${selected.id}`, { method: "PUT", body: { name } });
        window.location.reload();
      },
      remove: async () => {
        await examApi(`/years/${selected.id}`, { method: "DELETE" });
        window.location.assign("/exam/");
      },
    });
    return h(
      "div",
      { class: "sl-exam" },
      h("h2", {}, selected.current ? t("exam.classes.currentYearHeading", { name: selected.name }) : t("exam.classes.yearHeading", { name: selected.name }), " ", makeCurrent),
      readOnlyFor(selected, yearActions),
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
      next ? this.nextSection(next) : null,
      this.closeSection(selected),
      retention ? this.retentionSection(retention) : null
    );
  }

  /**
   * **Remove leavers' records** (exam-year-change design D4): how many
   * students who left are past the retention period and how many records of
   * each kind would go - counts, never names - and the purge, asked by a
   * second click. The server deletes only if the counts are still these.
   */
  retentionSection(report) {
    const line = messageLine();
    const { records } = report;
    const remove = (event) =>
      act(event.target, line, async () => {
        const removed = await examApi("/retention/purge", { method: "POST", body: { expected: report } });
        section.replaceChildren(section.firstChild, h("p", { role: "status", class: "sl-exam-retention-done" }, t("exam.retention.removed", { count: removed.students })));
      });
    const section = h(
      "section",
      { class: "sl-exam-retention" },
      h("h3", {}, t("exam.retention.heading")),
      h("p", { class: "sl-exam-quiet" }, t("exam.retention.explanation", { count: report.years })),
      report.students === 0
        ? h("p", {}, t("exam.retention.nothingDue"))
        : [
            h("p", {}, t("exam.retention.due", { count: report.students })),
            h(
              "ul",
              { class: "sl-exam-retention-counts" },
              h("li", {}, t("exam.retention.results", { count: records.results })),
              h("li", {}, t("exam.retention.notes", { count: records.notes ?? 0 })),
              h("li", {}, t("exam.retention.teacherNotes", { count: records.teacherNotes ?? 0 })),
              h("li", {}, t("exam.retention.overrides", { count: records.overrides })),
              h("li", {}, t("exam.retention.attempts", { count: records.attempts })),
              h("li", {}, t("exam.retention.sittings", { count: records.sittings })),
              h("li", {}, t("exam.retention.rosterEntries", { count: records.rosterEntries }))
            ),
            h(
              "p",
              {},
              confirmButton({
                class: "sl-exam-retention-remove",
                label: t("exam.retention.remove"),
                armed: t("exam.retention.removeArmed", { count: report.students }),
                action: remove,
              })
            ),
          ],
      line
    );
    return section;
  }

  /**
   * The classes of the year before, each offered one level up
   * (exam-year-change design D6): last year's roster ticked, the directory's
   * other current members of the new class unticked beside it, the courses to
   * copy, and **Create**. Nobody lands on a roster without being ticked.
   */
  nextSection({ state, year, previous, classes }) {
    if (!previous || classes.length === 0) return null;
    const pending = classes.filter((proposal) => proposal.name && proposal.existing === null);
    const notice = directoryNotice(state);
    return h(
      "details",
      { class: "sl-exam-next-year", open: pending.length > 0 },
      h("summary", {}, t("exam.years.nextHeading", { previous: previous.name, count: pending.length })),
      notice ? h("p", { class: "sl-exam-quiet" }, notice) : null,
      h(
        "ul",
        { class: "sl-exam-next-done" },
        classes
          .filter((proposal) => !proposal.name || proposal.existing !== null)
          .map((proposal) =>
            h(
              "li",
              { class: "sl-exam-quiet" },
              proposal.name
                ? [t("exam.years.nextExists", { from: displayClass(proposal.from.name) }), " ", h("a", { href: `/exam/classes/${proposal.existing}` }, displayClass(proposal.name))]
                : t("exam.years.nextNone", { from: displayClass(proposal.from.name) })
            )
          )
      ),
      pending.map((proposal) => this.nextClass(year.id, proposal))
    );
  }

  /** One of last year's classes, ready to be created one level up. */
  nextClass(yearId, proposal) {
    const line = messageLine();
    const box = (person) => h("input", { type: "checkbox", value: person.username, checked: person.lastYear, "aria-label": displayPerson(person) });
    const entry = (person) => {
      const tick = box(person);
      return { tick, item: h("li", {}, h("label", {}, tick, " ", displayPerson(person), " ", h("span", { class: "sl-exam-quiet" }, person.username))) };
    };
    const lastYear = proposal.people.filter((person) => person.lastYear).map(entry);
    const newcomers = proposal.people.filter((person) => !person.lastYear).map(entry);
    // Last year's teachers ticked, the directory's other teachers beside them (class-bound-teachers, task 5.5).
    const teachers = proposal.teachers ?? [];
    const lastTeachers = teachers.filter((teacher) => teacher.lastYear).map(entry);
    const otherTeachers = teachers.filter((teacher) => !teacher.lastYear).map(entry);
    const courses = proposal.courses.map((course) => ({
      course,
      tick: h("input", { type: "checkbox", value: String(course.id), checked: true, "aria-label": course.subject }),
    }));
    const create = (event) =>
      act(event.target, line, async () => {
        const klass = await examApi(`/years/${yearId}/next-classes`, {
          method: "POST",
          body: {
            from: proposal.from.id,
            students: [...lastYear, ...newcomers].filter(({ tick }) => tick.checked).map(({ tick }) => tick.value),
            teachers: [...lastTeachers, ...otherTeachers].filter(({ tick }) => tick.checked).map(({ tick }) => tick.value),
            courses: courses.filter(({ tick }) => tick.checked).map(({ course }) => course.id),
          },
        });
        window.location.assign(`/exam/classes/${klass.id}`);
      });
    return h(
      "section",
      { class: "sl-exam-next-class", "data-from": proposal.from.name },
      h("h3", {}, t("exam.years.nextClassHeading", { from: displayClass(proposal.from.name), name: displayClass(proposal.name) })),
      h("div", { class: "sl-exam-next-lists" },
        h("div", {},
          h("h4", {}, t("exam.years.lastYearRoster", { from: displayClass(proposal.from.name), count: lastYear.length })),
          lastYear.length ? h("ul", { class: "sl-exam-checklist sl-exam-next-last" }, lastYear.map(({ item }) => item)) : h("p", { class: "sl-exam-quiet" }, t("exam.classes.rosterEmpty"))
        ),
        h("div", {},
          h("h4", {}, t("exam.years.directoryOthers", { name: displayClass(proposal.name), count: newcomers.length })),
          newcomers.length ? h("ul", { class: "sl-exam-checklist sl-exam-next-new" }, newcomers.map(({ item }) => item)) : h("p", { class: "sl-exam-quiet" }, t("exam.years.directoryNoOthers"))
        )
      ),
      h("div", { class: "sl-exam-next-lists sl-exam-next-teachers" },
        h("div", {},
          h("h4", {}, t("exam.years.lastYearTeachers", { from: displayClass(proposal.from.name), count: lastTeachers.length })),
          lastTeachers.length ? h("ul", { class: "sl-exam-checklist sl-exam-next-last-teachers" }, lastTeachers.map(({ item }) => item)) : h("p", { class: "sl-exam-quiet" }, t("exam.classes.noTeachersEntered"))
        ),
        h("div", {},
          h("h4", {}, t("exam.years.otherTeachers", { count: otherTeachers.length })),
          otherTeachers.length
            ? h("details", {}, h("summary", {}, t("exam.years.showOtherTeachers")), h("ul", { class: "sl-exam-checklist sl-exam-checklist-long sl-exam-next-other-teachers" }, otherTeachers.map(({ item }) => item)))
            : h("p", { class: "sl-exam-quiet" }, t("exam.years.noOtherTeachers"))
        )
      ),
      courses.length
        ? h("p", { class: "sl-exam-next-courses" }, t("exam.years.coursesToCopy"), " ", courses.map(({ course, tick }) => h("label", {}, tick, " ", `${course.subject} (${languageLabels[course.language]})`, " ")))
        : null,
      h("p", {}, button({ label: t("exam.years.createNext", { name: displayClass(proposal.name) }), kind: "primary", class: "sl-exam-next-create", action: create })),
      line
    );
  }

  /**
   * **Close school year**, once the year's end date has passed and another
   * year is current (exam-year-change design D1). Asks by a second click that
   * says nothing can be changed afterwards.
   */
  closeSection(year) {
    if (year.closed || year.current || year.endsOn >= viennaLocal(new Date().toISOString()).date) return null;
    const line = messageLine();
    return h(
      "section",
      { class: "sl-exam-year-close" },
      h("h3", {}, t("exam.years.closeHeading")),
      h("p", { class: "sl-exam-quiet" }, t("exam.years.closeExplanation", { name: year.name })),
      h(
        "p",
        {},
        confirmButton({
          class: "sl-exam-year-close-button",
          label: t("exam.years.close"),
          armed: t("exam.years.closeArmed", { name: year.name }),
          action: (event) =>
            act(event.target, line, async () => {
              await examApi(`/years/${year.id}/close`, { method: "POST" });
              window.location.reload();
            }),
        })
      ),
      line
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
function checklist(people, className = "sl-exam-checklist") {
  const boxes = people.map((person) =>
    h("input", { type: "checkbox", value: person.username, "aria-label": displayPerson(person) })
  );
  const list = h(
    "ul",
    { class: className },
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
    const [{ years }, directory, teachers] = await Promise.all([examApi("/years"), examApi("/directory/classes"), examApi("/directory/teachers")]);
    const year = years.find((candidate) => String(candidate.id) === yearId);
    if (!year) throw new ExamApiError(404);
    return { year, directory, teachers };
  }

  render({ year, directory, teachers }) {
    const line = messageLine();
    const notice = directoryNotice(directory.state);
    const names = h("datalist", { id: "sl-exam-class-names" }, (directory.classes ?? []).map((name) => h("option", { value: displayClass(name) })));
    const nameInput = h("input", { name: "name", list: "sl-exam-class-names", required: true, placeholder: "5AHIF" });
    const members = h("div", {});
    // The directory's members of a class, 50 and more: a list that scrolls by itself in the dialog.
    const longList = "sl-exam-checklist sl-exam-checklist-long";
    let list = checklist([], longList);
    members.append(list);

    const showMembers = (event) =>
      act(event.target, line, async () => {
        const name = nameInput.value.trim().toLowerCase();
        if (!name) return;
        const answer = await examApi(`/directory/classes/${encodeURIComponent(name)}`);
        const waiting = directoryNotice(answer.state);
        list = checklist(answer.candidates ?? [], longList);
        members.replaceChildren(
          waiting
            ? h("p", { class: "sl-exam-quiet" }, waiting)
            : h("p", {}, t("exam.classes.directoryMembers", { count: answer.candidates.length, name: displayClass(name) })),
          answer.candidates?.length ? h("p", {}, h("button", { type: "button", class: "sl-exam-action", onclick: () => list.tickAll(true) }, t("exam.classes.tickAll")), " ", h("button", { type: "button", class: "sl-exam-action", onclick: () => list.tickAll(false) }, t("exam.classes.untickAll"))) : null,
          list
        );
      });

    // The teachers to enter in the class, nobody ticked (`class-teachers`).
    const teacherList = checklist(teachers.teachers ?? [], "sl-exam-checklist sl-exam-checklist-long sl-exam-class-new-teachers");

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
          body: { name: nameInput.value, students: list.ticked(), teachers: teacherList.ticked() },
        });
        window.location.assign(`/exam/classes/${klass.id}`);
      });

    return readOnlyFor(year, h(
      "div",
      { class: "sl-exam" },
      h("p", {}, t("exam.classes.yearSentence", { name: year.name })),
      notice ? h("p", { class: "sl-exam-quiet" }, notice) : null,
      h("p", {}, h("label", {}, t("exam.bar.class"), " ", nameInput), names, " ", h("button", { type: "button", class: "sl-exam-action", onclick: showMembers }, t("exam.classes.showMembers"))),
      members,
      h("p", {}, extra, " ", h("button", { type: "button", class: "sl-exam-action", onclick: addExtra }, t("exam.classes.addByUsername"))),
      h("h3", {}, t("exam.classes.teachers")),
      teachers.ready ? teacherList : h("p", { class: "sl-exam-quiet" }, directoryNotice(teachers.state) ?? t("exam.classes.directoryLoading")),
      h("p", {}, h("button", { type: "button", class: "sl-exam-primary", onclick: create }, t("exam.classes.createClass"))),
      line
    ));
  }
}

// -------------------------------------------------------------- one class

class ClassView extends ExamElement {
  async load() {
    const [klass, me] = await Promise.all([examApi(`/classes/${encodeURIComponent(this.params.class)}`), examMe()]);
    const [directory, teachers] = await Promise.all([
      examApi(`/directory/classes/${encodeURIComponent(klass.name)}`),
      me.admin ? examApi("/directory/teachers") : null,
    ]);
    return { klass, directory, admin: me.admin, teachers };
  }

  render({ klass, directory, admin, teachers }) {
    const heading = document.querySelector("#markdown-content h1");
    if (heading) heading.textContent = t("exam.classes.classHeading", { name: displayClass(klass.name), year: klass.year.name });
    const head = recordActions({
      name: displayClass(klass.name),
      label: t("exam.records.className"),
      armed: t("exam.records.deleteClassArmed", { name: displayClass(klass.name) }),
      className: "sl-exam-class-actions",
      rename: async (name) => {
        await examApi(`/classes/${klass.id}`, { method: "PUT", body: { name } });
        window.location.reload();
      },
      remove: async () => {
        await examApi(`/classes/${klass.id}`, { method: "DELETE" });
        window.location.assign(`/exam/?year=${klass.year.id}`);
      },
    });
    this.roster = this.rosterSection(klass);
    // Renaming and deleting a class are an admin's (`exam-record-maintenance`).
    const page = readOnlyFor(klass.year, h("div", { class: "sl-exam" }, admin ? head : null, this.roster, this.addSection(klass, directory), this.courseSection(klass)));
    // The teachers' list is no record of the year: an admin keeps it in a closed year too (class-bound-teachers D1).
    page.insertBefore(this.teacherSection(klass, admin, teachers), this.roster);
    return page;
  }

  /**
   * The teachers entered in the class (`class-teachers`), for everyone who
   * sees it; for an admin with a remove button each and a picker of the
   * directory's other teachers. Outside the closed year's read-only marking.
   */
  teacherSection(klass, admin, directory) {
    const line = messageLine();
    const entered = new Set(klass.teachers.map((teacher) => teacher.username));
    const change = (request) => (event) =>
      act(event.target, line, async () => {
        await request();
        await this.reload();
      });
    const items = klass.teachers.map((teacher) =>
      h(
        "li",
        { "data-username": teacher.username },
        displayPerson(teacher),
        " ",
        h("span", { class: "sl-exam-quiet" }, teacher.username),
        admin
          ? [
              " ",
              confirmButton({
                class: "sl-exam-teacher-remove",
                label: t("exam.classes.remove"),
                armed: t("exam.classes.removeTeacherArmed", { name: displayPerson(teacher) }),
                action: change(() => examApi(`/classes/${klass.id}/teachers/${encodeURIComponent(teacher.username)}`, { method: "DELETE" })),
              }),
            ]
          : null
      )
    );
    let picker = null;
    if (admin) {
      const offered = (directory?.teachers ?? []).filter((teacher) => !entered.has(teacher.username));
      const select = h(
        "select",
        { class: "sl-exam-teacher-picker", "aria-label": t("exam.classes.teacherPickerLabel") },
        h("option", { value: "" }, "–"),
        offered.map((teacher) => h("option", { value: teacher.username }, `${displayPerson(teacher)} (${teacher.username})`))
      );
      picker = directory?.ready
        ? h(
            "p",
            {},
            select,
            " ",
            button({
              label: t("exam.classes.enterTeacher"),
              class: "sl-exam-teacher-add",
              action: (event) => {
                if (!select.value) return;
                change(() => examApi(`/classes/${klass.id}/teachers`, { method: "POST", body: { username: select.value } }))(event);
              },
            })
          )
        : h("p", { class: "sl-exam-quiet" }, directoryNotice(directory?.state) ?? t("exam.classes.directoryLoading"));
    }
    return h(
      "section",
      { class: "sl-exam-class-teachers", "data-sl-reads": "" },
      h("h2", {}, t("exam.classes.teachers")),
      items.length ? h("ul", { class: "sl-exam-teacher-list" }, items) : h("p", { class: "sl-exam-quiet" }, t("exam.classes.noTeachersEntered")),
      picker,
      line
    );
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
    // A Matura candidate of any of the class's courses, with those subjects on hover.
    const subjects = new Map(klass.courses.map((course) => [course.subject.toLowerCase(), course.subject]));
    const nameCell = (entry) => {
      if (!entry.examParticipantIn?.length) return h("td", {}, personLabel(entry, { candidate: false }));
      const text = t("exam.participant.candidateIn", { subjects: entry.examParticipantIn.map((subject) => subjects.get(subject) ?? subject).join(", ") });
      return h("td", candidateMark(text), personLabel(entry, { name: h("span", {}, displayPerson(entry), candidateNote(text)) }));
    };
    const rows = (entries, removable) =>
      entries.map((entry) =>
        h(
          "tr",
          { class: entry.leftAt ? "sl-exam-left" : null },
          nameCell(entry),
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
      h("p", {}, h("button", { type: "button", class: "sl-exam-action", onclick: refresh }, t("exam.classes.refreshNames"))),
      line
    );
  }

  /**
   * Redraws only the roster after a student was added. Adding a whole class is
   * one click per student, in a row, so the rest of the page stays as the
   * teacher left it: the list of missing members open, the search results in
   * place, the scroll position where it was, and no loading flash between.
   */
  async redrawRoster() {
    const klass = await examApi(`/classes/${encodeURIComponent(this.params.class)}`);
    const roster = this.rosterSection(klass);
    this.roster.replaceWith(roster);
    this.roster = roster;
  }

  addSection(klass, directory) {
    const line = messageLine();
    const onRoster = new Set(klass.roster.filter((entry) => !entry.leftAt).map((entry) => entry.username));
    let section = null;
    let unit = null;
    const add = (username, added = () => {}) => (event) =>
      act(event.target, line, async () => {
        if (!username) return;
        await examApi(`/classes/${klass.id}/roster`, { method: "POST", body: { username } });
        onRoster.add(username);
        added();
        // The person leaves every list of this section that offered them.
        for (const item of section.querySelectorAll("li[data-username]")) {
          if (item.dataset.username === username) item.remove();
        }
        const left = unit.querySelectorAll("li[data-username]").length;
        const summary = unit.querySelector("summary");
        if (summary && left > 0) summary.textContent = t("exam.classes.missingMembers", { count: left, name: displayClass(klass.name) });
        if (summary && left === 0) {
          const done = h("p", { class: "sl-exam-quiet" }, t("exam.classes.everyoneOnRoster", { name: displayClass(klass.name) }));
          unit.replaceWith(done);
          unit = done;
        }
        await this.redrawRoster();
      });
    const personRow = (person) =>
      h("li", { "data-username": person.username }, displayPerson(person), " ", h("span", { class: "sl-exam-quiet" }, person.username), " ", h("button", { type: "button", class: "sl-exam-action", onclick: add(person.username) }, t("exam.classes.add")));

    const notice = directoryNotice(directory.state);
    const missing = (directory.candidates ?? []).filter((person) => !onRoster.has(person.username));
    unit = notice
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

    section = h(
      "section",
      {},
      h("h2", {}, t("exam.classes.addStudents")),
      unit,
      h("p", {}, query, " ", h("button", { type: "button", class: "sl-exam-action", onclick: search }, t("exam.classes.searchDirectory"))),
      results,
      h("p", {}, username, " ", h("button", { type: "button", class: "sl-exam-action", onclick: (event) => add(username.value.trim().toLowerCase(), () => (username.value = ""))(event) }, t("exam.classes.addByUsername"))),
      line
    );
    return section;
  }

  courseSection(klass) {
    return h(
      "section",
      { class: "sl-exam-class-courses" },
      h("h2", {}, t("exam.classes.courses"), " ", button({ label: t("exam.classes.addCourse"), class: "sl-exam-course-add", action: () => openCreatorOf("course") })),
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
    return readOnlyFor(klass.year, h("div", { class: "sl-exam" }, form, line));
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
    // A category at 0 % is hidden from the sheet with its columns; the note
    // says how many, so nobody takes them for deleted (design, Risks).
    const hidden = Object.fromEntries(course.categories.map((category) => [category, h("span", { class: "sl-exam-quiet sl-exam-hidden-columns" })]));
    const updateHidden = () => {
      for (const [category, note] of Object.entries(hidden)) {
        const count = course.columnCounts?.[category] ?? 0;
        note.textContent = Number(inputs[category].value) === 0 && count > 0 ? ` ${t("exam.classes.hiddenColumns", { count })}` : "";
      }
    };
    Object.values(inputs).forEach((input) => input.addEventListener("input", updateSum));
    Object.values(inputs).forEach((input) => input.addEventListener("input", updateHidden));
    updateSum();
    updateHidden();
    const sheet = h(
      "table",
      { class: "sl-exam-table sl-exam-config" },
      h("tbody", {}, course.categories.map((category) => h("tr", {}, h("td", {}, categoryLabels[category]), h("td", {}, inputs[category], " %", hidden[category]))))
    );
    // One save for the seven fields: their `change` events reach the table.
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

    return readOnlyFor(course.year, h(
      "div",
      { class: "sl-exam" },
      h("p", { class: "sl-exam-actions" }, linkButton({ label: t("exam.classes.openGradebook"), href: `/exam/courses/${course.id}/gradebook`, class: "sl-exam-course-gradebook" })),
      recordActions({
        name: course.subject,
        label: t("exam.classes.subject"),
        armed: t("exam.records.deleteCourseArmed", { name: course.subject }),
        className: "sl-exam-course-actions",
        rename: async (subject) => {
          await examApi(`/courses/${course.id}`, { method: "PUT", body: { subject } });
          window.location.reload();
        },
        remove: async () => {
          await examApi(`/courses/${course.id}`, { method: "DELETE" });
          window.location.assign(`/exam/classes/${course.classId}`);
        },
      }),
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
      )
    ));
  }
}

defineExamElement("classes-home", ClassesHome);
defineExamElement("year-new", YearNew);
defineExamElement("class-new", ClassNew);
defineExamElement("class", ClassView);
defineExamElement("course-new", CourseNew);
defineExamElement("course", CourseView);
