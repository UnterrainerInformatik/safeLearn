/**
 * The reader's texts and formats on an administration page (`ui-language`).
 * The language and the format are read from the page the server rendered
 * (`<html lang data-sl-locale>`), as the exam module's client does.
 */

import { createFormat } from "../../i18n/format.js";
import { createT, languageOf, localeOf } from "../../i18n/t.js";

async function fetchCatalog(lang) {
  const response = await fetch(`/i18n/${lang}.json`, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`The catalog ${lang}.json answered ${response.status}.`);
  return response.json();
}

/** Resolves to `{ t, format }` for this page's reader. */
export async function loadI18n() {
  const root = document.documentElement;
  const lang = languageOf(root.lang);
  const loc = localeOf(root.dataset.slLocale);
  let catalog = {};
  let fallback = null;
  try {
    [catalog, fallback] = await Promise.all([fetchCatalog(lang), lang === "en" ? null : fetchCatalog("en")]);
  } catch (error) {
    // The page still draws; every text shows as its key until the next load.
    console.error("[admin] The interface texts could not be loaded:", error);
  }
  return { t: createT(catalog, fallback, lang), format: createFormat(loc, lang) };
}

/** The JSON a data route answers, or an error naming its status. */
export async function fetchJson(url) {
  const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return response.json();
}

/** An element with `className` and text, the one way these pages build markup. */
export function element(tag, className = null, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}
