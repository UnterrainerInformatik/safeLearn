/**
 * A browser string (`User-Agent`) shortened for the teacher's live view
 * (`online-test`, exam-live-bound-browser design D4): browser, major version
 * and operating system, as in `Firefox 131 · Windows`. No dependency: an
 * ordered list of patterns for the browsers students use. For a string none
 * of them knows the view shows "Other browser" with the system where one is
 * found; the full string always stays one tap away in the view.
 *
 * What the browser claims is shown, never trusted: the binding of an attempt
 * is its cookie, and nothing here decides anything.
 */

// Checked in order: several browsers name the ones they are built on too, so
// Edge carries "Chrome/" and "Safari/", and Chrome carries "Safari/".
const browsers = [
  { name: "Edge", pattern: /\bEdg(?:e|A|iOS)?\/(\d+)/ },
  { name: "Opera", pattern: /\b(?:OPR|OPT)\/(\d+)/ },
  { name: "Samsung Internet", pattern: /\bSamsungBrowser\/(\d+)/ },
  { name: "Firefox", pattern: /\b(?:Firefox|FxiOS)\/(\d+)/ },
  { name: "Chrome", pattern: /\b(?:Chrome|CriOS)\/(\d+)/ },
  { name: "Chromium", pattern: /\bChromium\/(\d+)/ },
  { name: "Safari", pattern: /\bVersion\/(\d+)(?:\.\d+)*(?: Mobile\/\S+)? Safari\// },
];

// iPadOS asks for desktop pages and names itself a Mac; only the touch points
// would tell, which a header does not carry. It is shown as macOS then.
const systems = [
  { name: "iPadOS", pattern: /\biPad\b/ },
  { name: "iOS", pattern: /\b(?:iPhone|iPod)\b/ },
  { name: "Android", pattern: /\bAndroid\b/ },
  { name: "ChromeOS", pattern: /\bCrOS\b/ },
  { name: "Windows", pattern: /\bWindows\b/ },
  { name: "macOS", pattern: /\bMac OS X\b|\bMacintosh\b/ },
  { name: "Linux", pattern: /\bLinux\b/ },
];

/**
 * `{ browser, version, os }` for a browser string: the browser's name or
 * null, its major version or null, the system's name or null.
 */
export function parseUserAgent(value) {
  const text = typeof value === "string" ? value : "";
  let browser = null;
  let version = null;
  for (const candidate of browsers) {
    const match = candidate.pattern.exec(text);
    if (match) {
      browser = candidate.name;
      version = match[1];
      break;
    }
  }
  const os = systems.find((candidate) => candidate.pattern.test(text))?.name ?? null;
  return { browser, version, os };
}

/**
 * A browser string as the live view shows it (`boundBrowser`,
 * `refusedBrowser`): `short`, the label `Firefox 131 · Windows`, or null when
 * no browser was recognized; `os`, the system or null, for the view's own
 * "Other browser · Linux" in the reader's language; and `full`, the string
 * itself. Null for no attempt's browser at all; `full` null for a binding
 * recorded before browser strings were kept.
 */
export function browserLabel(value) {
  if (typeof value !== "string" || value.trim() === "") return { short: null, os: null, full: null };
  const { browser, version, os } = parseUserAgent(value);
  return { short: browser ? (os ? `${browser} ${version} · ${os}` : `${browser} ${version}`) : null, os, full: value };
}
