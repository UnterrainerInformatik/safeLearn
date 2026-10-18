/**
 * `<sl-date-input>`, the module's own date field (`locale-formats`, design.md,
 * D5): it shows and accepts a date in the reader's format, whatever the
 * browser or the operating system is set to, which the native `date` and
 * `datetime-local` inputs cannot.
 *
 * A text field in the format's pattern ("20.10.2026", "20/10/2026") and a
 * button that opens a month grid. With `time`, an "HH:MM" field beside it.
 * Its `value` is what the native inputs gave: "YYYY-MM-DD", or with `time`
 * "YYYY-MM-DDTHH:MM" in Vienna local time; "" while nothing valid is entered.
 * `min` and `max` are ISO dates. Form-associated through `ElementInternals`,
 * so it takes part in a form's submission and validity like a native input.
 *
 * Light DOM, so the page's styles and dark mode reach it. It sends `change`
 * (and `input`) from itself when a valid value is taken - typed and left, or
 * picked - and never for a value it cannot read; that one is marked invalid
 * with its reason beside the field.
 */

import { readDate, parseTime } from "../../i18n/format.js";
import { format, t } from "./frame.js";
import { viennaLocal } from "./periods.js";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The same day `months` later, or the month's last day if it is shorter. */
function addMonths(iso, months) {
  const [year, month, day] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, last))).toISOString().slice(0, 10);
}

/** Today's calendar day in Vienna, as an ISO date. */
function viennaToday() {
  return viennaLocal(new Date()).date;
}

let counter = 0;

class DateInput extends HTMLElement {
  static formAssociated = true;
  static observedAttributes = ["value", "min", "max", "disabled", "required"];

  constructor() {
    super();
    this.internals = this.attachInternals();
    this.current = "";
    this.built = false;
  }

  connectedCallback() {
    if (!this.built) this.build();
    this.syncLabel();
  }

  attributeChangedCallback(name, old, value) {
    if (!this.built) return;
    if (name === "value") this.value = value ?? "";
    else if (name === "disabled") this.applyDisabled();
    else this.validate();
  }

  build() {
    this.built = true;
    const id = `sl-date-input-${++counter}`;
    const { order, separator } = format.datePattern();
    const names = { day: t("exam.dateInput.dayPattern"), month: t("exam.dateInput.monthPattern"), year: t("exam.dateInput.yearPattern") };
    this.text = document.createElement("input");
    this.text.type = "text";
    this.text.className = "sl-date-input-text";
    this.text.inputMode = "numeric";
    this.text.autocomplete = "off";
    this.text.placeholder = order.map((part) => names[part]).join(separator);
    this.text.size = 10;
    this.text.setAttribute("aria-describedby", `${id}-message`);

    this.toggle = document.createElement("button");
    this.toggle.type = "button";
    this.toggle.className = "sl-date-input-toggle";
    this.toggle.setAttribute("aria-label", t("exam.dateInput.openCalendar"));
    this.toggle.setAttribute("aria-haspopup", "dialog");
    this.toggle.setAttribute("aria-expanded", "false");
    this.toggle.textContent = "▦";

    this.message = document.createElement("span");
    this.message.className = "sl-date-input-message";
    this.message.id = `${id}-message`;
    this.message.setAttribute("aria-live", "polite");

    const parts = [this.text, this.toggle];
    if (this.hasAttribute("time")) {
      this.clock = document.createElement("input");
      this.clock.type = "text";
      this.clock.className = "sl-date-input-time";
      this.clock.inputMode = "numeric";
      this.clock.autocomplete = "off";
      this.clock.placeholder = t("exam.dateInput.timePattern");
      this.clock.size = 5;
      this.clock.setAttribute("aria-label", t("exam.dateInput.time"));
      this.clock.setAttribute("aria-describedby", `${id}-message`);
      parts.push(this.clock);
    }
    this.popup = document.createElement("div");
    this.popup.className = "sl-date-input-popup";
    this.popup.setAttribute("role", "dialog");
    this.popup.setAttribute("aria-label", t("exam.dateInput.calendar"));
    this.popup.hidden = true;
    this.replaceChildren(...parts, this.popup, this.message);

    // The fields' own events stay inside: the element sends its own, and
    // only for a value it took.
    for (const field of [this.text, this.clock].filter(Boolean)) {
      field.addEventListener("input", (event) => {
        event.stopPropagation();
        this.clearProblem();
      });
      field.addEventListener("change", (event) => {
        event.stopPropagation();
        this.take();
      });
      field.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          // Taken now; a form around the field still submits.
          this.take();
        } else if (event.key === "ArrowDown" && event.altKey && field === this.text) {
          event.preventDefault();
          this.open();
        }
      });
    }
    this.toggle.addEventListener("click", () => (this.popup.hidden ? this.open() : this.close(true)));
    this.addEventListener("focusout", (event) => {
      if (!this.popup.hidden && !this.contains(event.relatedTarget)) this.close(false);
    });

    this.value = this.getAttribute("value") ?? "";
    this.applyDisabled();
  }

  /** The inner fields' name for screen readers: the element's label. */
  syncLabel() {
    const label = this.getAttribute("aria-label") ?? this.internals.labels?.[0]?.textContent?.trim() ?? "";
    if (label) this.text.setAttribute("aria-label", this.clock ? `${label}, ${t("exam.dateInput.date")}` : label);
  }

  applyDisabled() {
    const disabled = this.hasAttribute("disabled");
    for (const control of [this.text, this.toggle, this.clock].filter(Boolean)) control.disabled = disabled;
    if (disabled) this.close(false);
  }

  formDisabledCallback(disabled) {
    this.toggleAttribute("disabled", disabled);
  }

  // Reflected like a native input's, so `h()` and callers can set them as
  // properties.
  get name() {
    return this.getAttribute("name");
  }

  set name(value) {
    this.setAttribute("name", value);
  }

  get min() {
    return this.getAttribute("min");
  }

  set min(value) {
    if (value) this.setAttribute("min", value);
    else this.removeAttribute("min");
  }

  get max() {
    return this.getAttribute("max");
  }

  set max(value) {
    if (value) this.setAttribute("max", value);
    else this.removeAttribute("max");
  }

  get required() {
    return this.hasAttribute("required");
  }

  set required(value) {
    this.toggleAttribute("required", Boolean(value));
  }

  get disabled() {
    return this.hasAttribute("disabled");
  }

  set disabled(value) {
    this.toggleAttribute("disabled", Boolean(value));
  }

  get form() {
    return this.internals.form;
  }

  get validity() {
    return this.internals.validity;
  }

  get validationMessage() {
    return this.internals.validationMessage;
  }

  checkValidity() {
    return this.internals.checkValidity();
  }

  reportValidity() {
    return this.internals.reportValidity();
  }

  focus(options) {
    this.text?.focus(options);
  }

  /** "YYYY-MM-DD", or with `time` "YYYY-MM-DDTHH:MM"; "" while nothing valid is entered. */
  get value() {
    return this.current;
  }

  set value(value) {
    const text = String(value ?? "");
    const [date, time = ""] = text.split("T");
    if (!this.built) {
      this.setAttribute("value", text);
      return;
    }
    if (isoDate.test(date)) {
      this.text.value = format.date(date);
      if (this.clock) this.clock.value = time.slice(0, 5);
    } else {
      this.text.value = "";
      if (this.clock) this.clock.value = "";
    }
    this.validate();
  }

  /** The date part alone, for a caller of a `time` field. */
  get date() {
    return this.current.split("T")[0];
  }

  /**
   * Reads the fields, stores what they are worth and marks a problem at the
   * field. Returns the value taken, "" for none.
   */
  validate() {
    const range = { min: this.min?.slice(0, 10) || null, max: this.max?.slice(0, 10) || null, required: this.required };
    let { value, problem } = readDate(this.text.value, format.locale, range);
    if (value && this.clock) {
      const time = parseTime(this.clock.value);
      if (time === null) problem = this.clock.value.trim() === "" && !this.required ? "missingTime" : "unreadableTime";
      else value = `${value}T${time}`;
    }
    const messages = {
      missing: t("exam.dateInput.missing"),
      unreadable: t("exam.dateInput.unreadable", { example: format.date("2026-10-20") }),
      tooEarly: t("exam.dateInput.tooEarly", { date: range.min ? format.date(range.min) : "" }),
      tooLate: t("exam.dateInput.tooLate", { date: range.max ? format.date(range.max) : "" }),
      missingTime: t("exam.dateInput.missingTime"),
      unreadableTime: t("exam.dateInput.unreadableTime"),
    };
    const flags = {
      missing: { valueMissing: true },
      unreadable: { badInput: true },
      tooEarly: { rangeUnderflow: true },
      tooLate: { rangeOverflow: true },
      missingTime: { valueMissing: true },
      unreadableTime: { badInput: true },
    };
    this.current = problem ? "" : (value ?? "");
    this.internals.setFormValue(this.current);
    if (problem) {
      this.internals.setValidity(flags[problem], messages[problem], problem.endsWith("Time") ? this.clock : this.text);
      this.showProblem(messages[problem]);
    } else {
      this.internals.setValidity({});
      this.clearProblem();
    }
    return this.current;
  }

  showProblem(text) {
    this.message.textContent = text;
    this.classList.add("is-invalid");
    for (const field of [this.text, this.clock].filter(Boolean)) field.setAttribute("aria-invalid", "true");
  }

  clearProblem() {
    this.message.textContent = "";
    this.classList.remove("is-invalid");
    for (const field of [this.text, this.clock].filter(Boolean)) field.removeAttribute("aria-invalid");
  }

  /** Takes what is typed, and tells listeners when it is a new valid value. */
  take() {
    const before = this.current;
    const after = this.validate();
    if (after !== "" && after !== before) {
      this.text.value = format.date(after.slice(0, 10));
      this.dispatchEvent(new Event("input", { bubbles: true }));
      this.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // ------------------------------------------------------------ the grid

  open() {
    if (this.hasAttribute("disabled")) return;
    const typed = readDate(this.text.value, format.locale).value;
    this.focused = this.clamp(typed ?? viennaToday());
    this.popup.hidden = false;
    this.toggle.setAttribute("aria-expanded", "true");
    this.drawGrid();
    this.popup.querySelector("[data-day][tabindex='0']")?.focus();
  }

  close(returnFocus) {
    if (!this.popup || this.popup.hidden) return;
    this.popup.hidden = true;
    this.toggle.setAttribute("aria-expanded", "false");
    if (returnFocus) this.toggle.focus();
  }

  clamp(iso) {
    const min = this.min?.slice(0, 10);
    const max = this.max?.slice(0, 10);
    if (min && iso < min) return min;
    if (max && iso > max) return max;
    return iso;
  }

  inRange(iso) {
    const min = this.min?.slice(0, 10);
    const max = this.max?.slice(0, 10);
    return !(min && iso < min) && !(max && iso > max);
  }

  pick(iso) {
    if (!this.inRange(iso)) return;
    this.text.value = format.date(iso);
    this.close(true);
    if (this.clock && !parseTime(this.clock.value)) {
      // The date is in; the time is still to be typed.
      this.validate();
      this.clock.focus();
      return;
    }
    this.take();
  }

  move(iso) {
    this.focused = this.clamp(iso);
    this.drawGrid();
    this.popup.querySelector("[data-day][tabindex='0']")?.focus();
  }

  drawGrid() {
    const focused = this.focused;
    const first = `${focused.slice(0, 8)}01`;
    const [year, month] = first.split("-").map(Number);
    // Monday-based weeks: the grid starts at the Monday on or before the 1st.
    const weekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const start = addDays(first, -weekday);
    const selected = this.current.slice(0, 10);
    const today = viennaToday();

    const button = (label, text, onClick) => {
      const element = document.createElement("button");
      element.type = "button";
      element.setAttribute("aria-label", label);
      element.textContent = text;
      element.addEventListener("click", onClick);
      return element;
    };
    const head = document.createElement("div");
    head.className = "sl-date-input-head";
    const title = document.createElement("span");
    title.className = "sl-date-input-month";
    title.setAttribute("aria-live", "polite");
    title.id = `${this.message.id}-month`;
    title.textContent = format.monthYear(first);
    head.append(
      button(t("exam.dateInput.previousMonth"), "‹", () => this.move(addMonths(focused, -1))),
      title,
      button(t("exam.dateInput.nextMonth"), "›", () => this.move(addMonths(focused, 1)))
    );

    const grid = document.createElement("table");
    grid.className = "sl-date-input-grid";
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-labelledby", title.id);
    const headRow = document.createElement("tr");
    for (const name of format.weekdayNames()) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = name;
      headRow.append(cell);
    }
    const thead = document.createElement("thead");
    thead.append(headRow);
    const tbody = document.createElement("tbody");
    let day = start;
    for (let week = 0; week < 6; week++) {
      const row = document.createElement("tr");
      for (let column = 0; column < 7; column++) {
        const cell = document.createElement("td");
        cell.setAttribute("role", "gridcell");
        const iso = day;
        const dayButton = document.createElement("button");
        dayButton.type = "button";
        dayButton.dataset.day = iso;
        dayButton.textContent = String(Number(iso.slice(8, 10)));
        dayButton.setAttribute("aria-label", format.longDate(iso));
        dayButton.tabIndex = iso === focused ? 0 : -1;
        if (iso.slice(0, 7) !== first.slice(0, 7)) dayButton.classList.add("is-other-month");
        if (iso === today) dayButton.setAttribute("aria-current", "date");
        if (iso === selected) {
          dayButton.classList.add("is-selected");
          cell.setAttribute("aria-selected", "true");
        }
        if (!this.inRange(iso)) {
          dayButton.setAttribute("aria-disabled", "true");
          dayButton.classList.add("is-disabled");
        }
        dayButton.addEventListener("click", () => this.pick(iso));
        cell.append(dayButton);
        row.append(cell);
        day = addDays(day, 1);
      }
      tbody.append(row);
    }
    grid.append(thead, tbody);
    grid.addEventListener("keydown", (event) => this.gridKey(event));
    this.popup.replaceChildren(head, grid);
  }

  gridKey(event) {
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let target = null;
    if (event.key in steps) target = addDays(this.focused, steps[event.key]);
    else if (event.key === "PageUp") target = addMonths(this.focused, event.shiftKey ? -12 : -1);
    else if (event.key === "PageDown") target = addMonths(this.focused, event.shiftKey ? 12 : 1);
    else if (event.key === "Home") target = addDays(this.focused, -((new Date(`${this.focused}T00:00:00Z`).getUTCDay() + 6) % 7));
    else if (event.key === "End") target = addDays(this.focused, 6 - ((new Date(`${this.focused}T00:00:00Z`).getUTCDay() + 6) % 7));
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.pick(this.focused);
      return;
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    } else {
      return;
    }
    event.preventDefault();
    this.move(target);
  }
}

if (!customElements.get("sl-date-input")) customElements.define("sl-date-input", DateInput);
