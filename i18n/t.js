/**
 * The interface texts (`ui-language`): one lookup function per reader, built
 * from the catalog of the reader's language and the English one beneath it.
 *
 * Free of DOM and Node code on purpose: the server imports this file to render
 * pages, the unit checks import it, and the browser loads the same file from
 * `/i18n/`, so a text looks the same whichever side drew it (design.md, D3).
 *
 * Catalogs are BabelEdit's "JSON (nested)" files: `exam.tests.emptyList` is
 * `{ "exam": { "tests": { "emptyList": "…" } } }`. A text may carry
 * parameters written `{name}`. A text that depends on a count is two keys,
 * `…_one` and `…_other`, chosen by `Intl.PluralRules` from `params.count`.
 */

/** The languages the interface is written in; the first is the default. */
export const languages = Object.freeze(["en", "de"]);

/** Each language by its own name, never translated (design.md, D6). */
export const languageNames = Object.freeze({ en: "English", de: "Deutsch" });

/** The formats a reader can choose; the first is the default. */
export const locales = Object.freeze(["de-AT", "en-GB"]);

/** `value` when it is one of the languages, else the default. */
export function languageOf(value) {
  return languages.includes(value) ? value : languages[0];
}

/** `value` when it is one of the formats, else the default. */
export function localeOf(value) {
  return locales.includes(value) ? value : locales[0];
}

function lookup(catalog, key) {
  let node = catalog;
  for (const segment of key.split(".")) {
    if (node === null || typeof node !== "object" || !Object.hasOwn(node, segment)) return undefined;
    node = node[segment];
  }
  return typeof node === "string" ? node : undefined;
}

function fill(text, params) {
  return text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(params, name) ? String(params[name]) : whole));
}

const inProduction = () => globalThis.process?.env?.NODE_ENV === "production";

/**
 * `t(key, params)` for a reader of `locale` (the language whose plural rules
 * apply). Lookup order: `catalog`, then `fallback` (English), then - a text
 * missing from both, which the catalog check keeps from shipping - the key
 * itself, in brackets and with a warning outside production.
 */
export function createT(catalog, fallback = null, locale = "en") {
  const plurals = new Intl.PluralRules(locale);
  const find = (key) => lookup(catalog, key) ?? (fallback ? lookup(fallback, key) : undefined);
  const t = (key, params = {}) => {
    let text;
    if (typeof params.count === "number") {
      text = find(`${key}_${plurals.select(params.count)}`) ?? find(`${key}_other`);
    }
    text ??= find(key);
    if (text === undefined) {
      if (inProduction()) return key;
      console.warn(`[i18n] No text for "${key}".`);
      return `[${key}]`;
    }
    return fill(text, params);
  };
  t.locale = locale;
  return t;
}
