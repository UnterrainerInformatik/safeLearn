/**
 * The reader's texts and formats in the module's client (`ui-language`,
 * design.md, D3). The language and the format are read from the page the
 * server rendered (`<html lang data-sl-locale>`), so the catalogs can be
 * fetched at once, in parallel with `/me`, instead of after it.
 *
 * `loadI18n()` resolves to `{ lang, loc, t, format }`; `frame.js` awaits it
 * once and every element module imports `t` and `format` from there.
 */

import { createFormat } from "../../i18n/format.js";
import { createT, languageOf, localeOf } from "../../i18n/t.js";

async function fetchCatalog(lang) {
  const response = await fetch(`/i18n/${lang}.json`, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`The catalog ${lang}.json answered ${response.status}.`);
  return response.json();
}

export async function loadI18n() {
  const root = document.documentElement;
  const lang = languageOf(root.lang);
  const loc = localeOf(root.dataset.slLocale);
  let catalog = {};
  let fallback = null;
  try {
    [catalog, fallback] = await Promise.all([fetchCatalog(lang), lang === "en" ? null : fetchCatalog("en")]);
  } catch (error) {
    // The elements still draw; every text shows as its key until the next load.
    console.error("[exam] The interface texts could not be loaded:", error);
  }
  return { lang, loc, t: createT(catalog, fallback, lang), format: createFormat(loc, lang) };
}
