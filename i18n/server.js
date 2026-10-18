/**
 * The server's side of `ui-language`: the catalogs, read once at start, and
 * the texts and formats of one request, built from that request's
 * preferences the first time something asks for them (design.md, D3).
 *
 * Node-only; the browser loads `t.js`, `format.js` and the catalogs from
 * `/i18n/` instead.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { getPermissionContext } from "../permission-context.js";
import { createFormat } from "./format.js";
import { createT, languages } from "./t.js";

const catalogs = Object.fromEntries(
  languages.map((lang) => [lang, JSON.parse(readFileSync(path.join(import.meta.dirname, `${lang}.json`), "utf8"))])
);

/** `t` and `format` for a reader of `lang` and `loc`, both already validated. */
export function i18nFor(lang, loc) {
  return {
    lang,
    loc,
    t: createT(catalogs[lang], lang === "en" ? null : catalogs.en, lang),
    format: createFormat(loc, lang),
  };
}

/**
 * The texts and formats of this request's reader, from the preferences its
 * permission context settled on - the defaults for a request without a
 * session. Built once per request and kept on it.
 */
export function i18nOf(req) {
  if (!req.i18n) {
    req.i18n = getPermissionContext(req).then(({ preferences }) => i18nFor(preferences.lang, preferences.loc));
  }
  return req.i18n;
}
