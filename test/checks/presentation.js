/**
 * The presentation and the document view.
 *
 * Reads `md/presentations/test-presentation.md` as a deck and
 * `md/test-md-file.md` as a document.
 *
 * The deck is asserted on the structure the server renders into `#revealContent`,
 * so nothing here needs Reveal to have run. Reveal itself is served by the
 * application out of the version `package.json` declares, which is what the
 * self-containment check below is about: a deck must reach no host but the
 * deployment and the identity provider it authenticates against.
 *
 * This is a module, not a test file: `test/content.test.js` imports it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, describe, test } from "node:test";

import {
  hostKinds,
  hostsContactedWhile,
  render,
  sameOriginReferences,
  setPreferences,
  sharedSession,
} from "../harness.js";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");

const deckPath = "/md/presentations/test-presentation.md";
const deckSource = readFileSync(path.join(projectRoot, "md", "presentations", "test-presentation.md"), "utf8");

/**
 * `md/presentations/test-presentation.md` demonstrates the deck's heading
 * structure but uses no fragments, so the fragment demonstration of the corpus
 * is read as a deck instead. See docs-testing.md.
 */
const fragmentPath = "/md/test-md-file.md";

const documentPath = "/md/test-md-file.md";

/**
 * References this application emits that do not resolve, each with the reason
 * and the change that owns the repair.
 *
 * A listed entry is reported and does not fail the run. An entry that no longer
 * dangles fails, so the exception cannot outlive its repair — the change that
 * fixes the reference deletes the line here in the same commit.
 *
 * Empty today: the presentation wrapper's `/obsidian-page.css` was the entry
 * this list was written for, and the working tree no longer emits it.
 */
const knownDangling = [];

/** The headings of the deck's Markdown source, in order. */
function sourceHeadings() {
  const lines = deckSource.split("\n");
  const headings = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const match = line.match(/^(#{2,3})\s+(.*)$/);
    if (match) headings.push({ level: match[1].length, text: match[2].trim() });
  }
  return headings;
}

/** What each element claims the thing it addresses is. */
function expectedType(reference) {
  if (reference.element === "script") return /javascript|ecmascript/i;
  if (reference.element === "link" && /stylesheet/i.test(reference.rel ?? "")) return /css/i;
  if (reference.element === "link" && /icon/i.test(reference.rel ?? "")) return /image|icon/i;
  if (reference.element === "img" || reference.element === "source") return /image|video|audio/i;
  return null;
}

/**
 * Splits the references into the ones that resolve, the ones that dangle and the
 * listed exceptions, and reports which listed entries have been repaired.
 *
 * Pure on purpose: the rules are the part worth proving, and they are proven
 * below without a browser.
 */
export function classifyReferences(references, exceptions = knownDangling) {
  const dangling = [];
  const reported = [];
  const resolved = [];

  for (const reference of references) {
    const type = expectedType(reference);
    let why = null;
    if (reference.status === null) why = `the request failed (${reference.error ?? "no answer"})`;
    else if (reference.status >= 400) why = `it answers ${reference.status}`;
    else if (reference.redirected) why = `it falls through to ${reference.servedFrom}`;
    else if (type && !type.test(reference.contentType ?? "")) {
      why = `it is served as ${reference.contentType ?? "nothing"}`;
    }

    const listed = exceptions.find((entry) => entry.reference === reference.reference);
    if (!why) {
      resolved.push(reference);
      continue;
    }
    if (listed) reported.push({ ...reference, why, ...listed });
    else dangling.push({ ...reference, why });
  }

  // An entry that produced no report has been repaired: either the reference is
  // gone from the markup, or it resolves again.
  const repaired = exceptions.filter(
    (entry) => !reported.some((report) => report.reference === entry.reference)
  );

  return { resolved, dangling, reported, repaired };
}

describe("presentation and document", () => {
  let session;

  before(async () => {
    session = await sharedSession("teacher");
    await setPreferences(session, {});
  });

  // ---- 7.1 The deck's structure ----

  test("the deck is built from the source's heading structure", async () => {
    await render(session, deckPath, { view: "presentation" });
    const built = await session.page.evaluate(() => {
      const root = document.querySelector("#revealContent");
      const top = [...root.children].filter((child) => child.tagName === "SECTION");
      return top.map((section) => ({
        nested: [...section.children].filter((child) => child.tagName === "SECTION").length,
        headings: [...section.querySelectorAll("h2")].map((heading) => heading.textContent.trim()),
        subHeadings: [...section.querySelectorAll("h3")].map((heading) => heading.textContent.trim()),
      }));
    });

    const headings = sourceHeadings();
    const topLevel = headings.filter((heading) => heading.level === 2);

    // Everything before the first `##` becomes a section of its own, so the deck
    // carries one more horizontal section than the source has top-level headings.
    assert.equal(
      built.length,
      topLevel.length + 1,
      `${deckPath} has ${topLevel.length} top-level headings and should produce ${topLevel.length + 1} horizontal sections`
    );

    assert.deepEqual(
      built.slice(1).map((section) => section.headings[0]),
      topLevel.map((heading) => heading.text),
      "each horizontal section after the first should open with the top-level heading it was cut at"
    );

    for (const [index, section] of built.entries()) {
      assert.equal(
        section.nested,
        section.subHeadings.length + 1,
        `horizontal section ${index + 1} carries ${section.subHeadings.length} headings one level down ` +
          `and should hold ${section.subHeadings.length + 1} vertical sections`
      );
      for (const subHeading of section.subHeadings) {
        assert.ok(
          headings.some((heading) => heading.level === 3 && heading.text === subHeading),
          `"${subHeading}" turned up in the deck but is not a heading of the source`
        );
      }
    }
  });

  // ---- 7.2 Fragments in a deck ----

  test("fragments render as fragments in a deck", async () => {
    await render(session, fragmentPath, { view: "presentation" });
    const fragments = await session.page.evaluate(() =>
      [...document.querySelectorAll("#revealContent .fragment")].map((fragment) =>
        fragment.getAttribute("data-fragment-index")
      )
    );
    assert.ok(fragments.length > 0, `${fragmentPath} as a deck should still carry its fragments`);
    for (const index of fragments) {
      assert.match(index ?? "", /^\d+$/, `a fragment in the deck carries "${index}" instead of an index`);
    }
    assert.ok(fragments.includes("0"), "the fragment indices in a deck should start at 0 like they do on a page");
  });

  // ---- 7.3 The deck's own references ----

  test("every reference the deck makes to this application resolves and is served as what it claims", async () => {
    await render(session, deckPath, { view: "presentation" });
    const references = await sameOriginReferences(session.page);
    assert.ok(references.length > 0, "the deck should reference stylesheets and assets of this application");

    const { dangling, reported, repaired } = classifyReferences(references);

    for (const entry of reported) {
      console.log(
        `  known dangling reference: ${entry.reference} — ${entry.why}. ` +
          `${entry.reason} Owned by ${entry.change}.`
      );
    }
    assert.deepEqual(
      repaired,
      [],
      `these references are on the known-dangling list but no longer dangle. Delete their entries in ` +
        `test/checks/presentation.js: ${repaired.map((entry) => entry.reference).join(", ")}`
    );
    assert.deepEqual(
      dangling.map((entry) => `${entry.reference} (${entry.why})`),
      [],
      "the deck addresses references of this application that do not resolve"
    );
  });

  test("the deck contacts no host but the application and its identity provider", async () => {
    const contacted = await hostsContactedWhile(session, () =>
      render(session, deckPath, { view: "presentation" })
    );

    assert.ok(
      contacted.some((entry) => entry.kind === hostKinds.application),
      "a rendered deck should have contacted the application it was requested from; " +
        "if it contacted nothing at all, this check is watching the wrong thing"
    );

    const external = contacted.filter((entry) => entry.kind === hostKinds.external);
    assert.deepEqual(
      external.map((entry) => `${entry.host} (requested as ${entry.addresses.join(", ")})`),
      [],
      "a deck must render out of the deployment alone: everything it needs — engine, styles, " +
        "plugins, fonts — is served by the application. A host listed here means a lesson depends " +
        "on that host being reachable, and that opening a deck tells it so."
    );
  });

  // ---- 7.3a The recorder the check above reads ----

  test("a host a stylesheet asks for is recorded, refused or not", async () => {
    // The shape of the defect this check exists for: until Reveal was served by
    // the deployment, the theme it loaded imported Lato from Google, and no
    // element on the page named that host — a check reading `href`/`src` saw a
    // clean page. The import is added here rather than waited for, because the
    // application no longer emits one.
    //
    // The session refuses every host but the two known ones, so the request is
    // aborted before it leaves this machine and Google is not contacted. That it
    // is reported anyway is the second half of what is being proven.
    const address = "https://fonts.googleapis.com/css?family=Lato:300,700";
    await render(session, deckPath, { view: "presentation" });
    const contacted = await hostsContactedWhile(session, () =>
      session.page.evaluate((imported) => {
        const style = document.createElement("style");
        style.textContent = `@import url("${imported}");`;
        document.head.append(style);
      }, address)
    );

    const entry = contacted.find((host) => host.host === "fonts.googleapis.com");
    assert.ok(
      entry,
      "a host asked for by an @import inside a stylesheet was not reported. The check above " +
        "would then pass over exactly the reference it was written for."
    );
    assert.equal(entry.kind, hostKinds.external, "a font service is neither the application nor the identity provider");
    assert.deepEqual(entry.addresses, [address], "the address that caused the request should be reported with the host");
    assert.ok(
      session.refusedHosts.has("fonts.googleapis.com"),
      "the request should have been refused rather than answered — this run does not contact third parties"
    );
  });

  // ---- 7.4 The rules the known-dangling list follows ----

  test("the known-dangling list reports what it lists, fails what it does not, and cannot outlive a repair", () => {
    const resolves = {
      reference: "/css/reveal.css",
      element: "link",
      rel: "stylesheet",
      status: 200,
      contentType: "text/css; charset=UTF-8",
      redirected: false,
    };
    const dangles = {
      reference: "/obsidian-page.css",
      element: "link",
      rel: "stylesheet",
      status: 200,
      contentType: "text/html; charset=utf-8",
      redirected: true,
      servedFrom: "http://localhost:8080/README.md",
    };
    const listed = [{ reference: "/obsidian-page.css", reason: "There is no such file.", change: "initial-repairs" }];

    const unlisted = classifyReferences([resolves, dangles], []);
    assert.equal(unlisted.dangling.length, 1, "a dangling reference that is not listed fails the run");
    assert.equal(unlisted.reported.length, 0);
    assert.equal(unlisted.repaired.length, 0);

    const excused = classifyReferences([resolves, dangles], listed);
    assert.equal(excused.dangling.length, 0, "a listed dangling reference does not fail the run");
    assert.equal(excused.reported.length, 1, "a listed dangling reference is reported");
    assert.equal(excused.reported[0].change, "initial-repairs", "the report names the change that owns the repair");
    assert.equal(excused.repaired.length, 0);

    const afterRepair = classifyReferences([resolves], listed);
    assert.equal(
      afterRepair.repaired.length,
      1,
      "an entry whose reference no longer dangles fails the run, so the exception cannot outlive its repair"
    );

    const stillEmitted = classifyReferences([resolves, { ...dangles, redirected: false, contentType: "text/css" }], listed);
    assert.equal(
      stillEmitted.repaired.length,
      1,
      "an entry whose reference resolves again fails the run too"
    );
  });

  // ---- 7.5 The document view ----

  test("the document view is the content without the page shell", async () => {
    const asPage = await render(session, documentPath);
    const asDocument = await render(session, documentPath, { view: "document" });

    const shell = await session.page.evaluate(() => ({
      sidebar: Boolean(document.querySelector("#sidebar")),
      topbar: Boolean(document.querySelector("#topbar")),
      menu: Boolean(document.querySelector("#topdown-menu")),
    }));
    assert.ok(!shell.sidebar, "the document view should not carry the navigation tree");
    assert.ok(!shell.topbar, "the document view should not carry the top bar");
    assert.ok(!shell.menu, "the document view should not carry the settings menu");

    assert.ok(asDocument.text.trim().length > 0, "the document view should carry the rendered content");
    assert.equal(
      asDocument.text,
      asPage.text,
      "the document view should show the same session the same content as the page view"
    );
  });
});
