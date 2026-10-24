/**
 * Dates, times and numbers in the reader's format (`locale-formats`): one
 * function per kind of value, each with the reader's locale and the school's
 * time zone, never the browser's or the operating system's.
 *
 * Shared by server, browser and unit checks like `t.js` (design.md, D4). Every
 * `Intl` formatter the app uses lives here, one cached instance per locale and
 * kind; a check in the test suite refuses `toLocale…String()` and new `Intl`
 * formatters anywhere else.
 *
 * A date-only value ("YYYY-MM-DD") is a calendar day, formatted in UTC so it
 * never shifts by a day; anything else is an instant, shown in Vienna.
 */

const timeZone = "Europe/Vienna";

/** The locale whose weekday names a language uses ("Di.", "Tue"). */
const weekdayLocales = { de: "de-AT", en: "en-GB" };

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

const cache = new Map();

function cached(kind, locale, build) {
  const key = `${kind}|${locale}`;
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

/** A formatter for `value`: date-only values in UTC, instants in Vienna. */
function dateFormatter(kind, locale, value, options) {
  const zone = typeof value === "string" && dateOnly.test(value) ? "UTC" : timeZone;
  return cached(`${kind}|${zone}`, locale, () => new Intl.DateTimeFormat(locale, { ...options, timeZone: zone }));
}

function asDate(value) {
  return typeof value === "string" && dateOnly.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
}

const dayMonthYear = { day: "2-digit", month: "2-digit", year: "numeric" };
const dayMonth = { day: "2-digit", month: "2-digit" };
const hourMinute = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

/**
 * The order of day, month and year in `locale` and the separator between
 * them, read from `Intl` so one parser serves every locale.
 */
export function datePattern(locale) {
  return cached("pattern", locale, () => {
    const parts = new Intl.DateTimeFormat(locale, { ...dayMonthYear, timeZone: "UTC" }).formatToParts(new Date(Date.UTC(2026, 9, 20)));
    const order = parts.filter((part) => ["day", "month", "year"].includes(part.type)).map((part) => part.type);
    const separator = parts.find((part) => part.type === "literal")?.value ?? ".";
    return { order, separator };
  });
}

function isoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The ISO date `text` names in `locale`'s pattern ("20.10.2026",
 * "20/10/2026"), or null when it names none: a day the month does not have,
 * a month past 12, a year not written with four digits, or anything else.
 * A trailing separator and surrounding blanks are allowed.
 */
export function parseDate(text, locale) {
  const { order, separator } = datePattern(locale);
  const fields = String(text ?? "")
    .trim()
    .replace(new RegExp(`\\${separator}$`), "")
    .split(separator);
  if (fields.length !== 3) return null;
  const value = {};
  for (const [index, type] of order.entries()) {
    const field = fields[index].trim();
    const pattern = type === "year" ? /^\d{4}$/ : /^\d{1,2}$/;
    if (!pattern.test(field)) return null;
    value[type] = Number(field);
  }
  const { year, month, day } = value;
  if (month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return isoDate(year, month, day);
}

/**
 * What a date field holding `text` is worth: `{ value, problem }`, the ISO
 * date (or null) and, when it cannot be taken, why - "missing" (blank),
 * "unreadable", "tooEarly" (before `min`) or "tooLate" (after `max`). `min`
 * and `max` are ISO dates; a blank field is only a problem when `required`.
 */
export function readDate(text, locale, { min = null, max = null, required = false } = {}) {
  if (String(text ?? "").trim() === "") return { value: null, problem: required ? "missing" : null };
  const value = parseDate(text, locale);
  if (value === null) return { value: null, problem: "unreadable" };
  if (min && value < min) return { value, problem: "tooEarly" };
  if (max && value > max) return { value, problem: "tooLate" };
  return { value, problem: null };
}

/** "HH:MM" when `text` is a time of day ("9:05" too), else null. */
export function parseTime(text) {
  const match = /^\s*([01]?\d|2[0-3]):([0-5]\d)\s*$/.exec(String(text ?? ""));
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

/**
 * The number `text` names, with a comma or a point as the decimal separator
 * whatever the locale ("1,5", "1.5"), or null for anything else. Blank text
 * is null too; the caller decides whether blank means "no value".
 */
export function parseNumber(text) {
  const normalized = String(text ?? "").trim().replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  return Number(normalized);
}

/**
 * The formatters of a reader of `locale` (the format) and `lang` (the
 * language, for weekday names). Every function takes an ISO date, an ISO
 * instant or a `Date`.
 */
export function createFormat(locale, lang = "en") {
  const weekdayLocale = weekdayLocales[lang] ?? weekdayLocales.en;
  return {
    locale,
    lang,
    /** "20.10.2026" / "20/10/2026". */
    date: (value) => dateFormatter("date", locale, value, dayMonthYear).format(asDate(value)),
    /** "20.10.2026, 10:00" / "20/10/2026, 10:00". */
    dateTime: (value) => dateFormatter("dateTime", locale, value, { ...dayMonthYear, ...hourMinute }).format(asDate(value)),
    /** "10:00". */
    time: (value) => dateFormatter("time", locale, value, hourMinute).format(asDate(value)),
    /** "10:00:05", for the live view's clocks. */
    clock: (value) => dateFormatter("clock", locale, value, { ...hourMinute, second: "2-digit" }).format(asDate(value)),
    /** "20.10." / "20/10": a day of the current school year, without the year. */
    dayMonth: (value) => dateFormatter("dayMonth", locale, value, dayMonth).format(asDate(value)),
    /** "Di. 20.10." / "Tue 20/10": the weekday in the language, the day in the format. */
    weekdayDay: (value) => {
      const date = asDate(value);
      // Taken from a date with day and month: German abbreviates "Di." there,
      // but writes a weekday on its own as "Di".
      const weekday = dateFormatter("weekday", weekdayLocale, value, { weekday: "short", day: "2-digit", month: "2-digit" })
        .formatToParts(date)
        .find((part) => part.type === "weekday").value;
      const day = dateFormatter("dayMonth", locale, value, dayMonth).format(date);
      return `${weekday} ${day}`;
    },
    /** "Oktober 2026" / "October 2026": a calendar's heading, in the language. */
    monthYear: (value) => dateFormatter("monthYear", weekdayLocale, value, { month: "long", year: "numeric" }).format(asDate(value)),
    /** "Dienstag, 20. Oktober 2026": a day as a screen reader announces it, in the language. */
    longDate: (value) =>
      dateFormatter("longDate", weekdayLocale, value, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(asDate(value)),
    /** The seven weekdays from Monday, abbreviated in the language: a calendar's column heads. */
    weekdayNames: () =>
      cached("weekdayNames", weekdayLocale, () => {
        const formatter = new Intl.DateTimeFormat(weekdayLocale, { weekday: "short", timeZone: "UTC" });
        // 2026-10-19 is a Monday.
        return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(Date.UTC(2026, 9, 19 + index))));
      }),
    /** "1,5" / "1.5", with at most `digits` decimals. */
    number: (n, digits = 2) =>
      cached(`number${digits}`, locale, () => new Intl.NumberFormat(locale, { maximumFractionDigits: digits })).format(n),
    /** "42 %" / "42%" for 0.42, with at most `digits` decimals. */
    percent: (fraction, digits = 0) =>
      cached(`percent${digits}`, locale, () => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits })).format(
        fraction
      ),
    /** The ISO date typed in this format, or null. */
    parseDate: (text) => parseDate(text, locale),
    /** The order of day, month and year in this format and their separator. */
    datePattern: () => datePattern(locale),
  };
}
