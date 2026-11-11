/**
 * Obsidian syntax the renderer resolves itself (`obsidian-syntax-coverage`):
 * stable heading anchors, wiki links to headings and blocks, block markers,
 * footnotes, math, and note embeds - decided by the code that decides them.
 *
 * Unit-level, in the shape of `test/attachments.test.js`: a fixture corpus is
 * written to a temporary directory and scanned with `scanFiles`, sessions are
 * plain objects carrying their roles as LDAP groups, and `fetch` is stubbed for
 * the one account lookup a permission context makes. A page is rendered the way
 * `app.js` renders it - `preParse`, a `marked` built with
 * `obsidianMarkedExtensions`, `manipulateHtml`, `sanitizeHtml`, `anchorHeadings`, and
 * `splitForReveal` for a deck - minus the Shiki highlighter, which none of
 * this touches. No server, no browser, no login. What the three views make of
 * it against a running instance is checked in `test/checks/obsidian-syntax.js`.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, describe, test } from "node:test";

import { JSDOM } from "jsdom";
import { Marked } from "marked";

import {
  anchorHeadings,
  manipulateHtml,
  maximumEmbedDepth,
  obsidianMarkedExtensions,
  preParse,
  scanFiles,
  slugify,
  splitForReveal,
} from "../obsidian.js";
import { sanitizeHtml } from "../sanitize.js";

const originalFetch = global.fetch;
const originalLog = console.log;
const fence = "```";

let corpus;

/** Writes `content` to `relative` inside the fixture corpus. */
function write(relative, content = "x") {
  const target = path.join(corpus, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

async function scan() {
  console.log = () => {};
  try {
    await scanFiles("md/", corpus);
  } finally {
    console.log = originalLog;
  }
}

/** A session as passport leaves it on `req`, reading `page` (relative to `md/`). */
function session(groups, name, page = "host.md") {
  return {
    protocol: "https",
    get: (header) => (header.toLowerCase() === "host" ? "learn.example" : undefined),
    path: `/md/${page}`,
    originalUrl: `/md/${page}`,
    session: {},
    user: {
      name,
      preferred_username: name.toLowerCase().replace(/\s+/g, ""),
      accessToken: "access-token",
      accessTokenDecoded: {},
      keycloakConfig: {
        "auth-server-url": "https://identity.example/",
        realm: "demo",
        resource: "safelearn",
      },
      rolesCalculated: JSON.stringify(groups),
    },
  };
}

const student = (page) => session({ student: true }, "Stu Dent", page);
const teacher = (page) => session({ teacher: true }, "Tea Cher", page);

/** The body of a page as `app.js` sends it to the page and document views. */
async function render(markdown, req = student()) {
  const marked = new Marked({ async: true, breaks: true, gfm: true, pedantic: false });
  marked.use(...obsidianMarkedExtensions());
  const html = await marked.parse(await preParse(markdown, req));
  return anchorHeadings(sanitizeHtml(manipulateHtml(html, req)), req);
}

/** The same body as the presentation view receives it. */
async function renderDeck(markdown, req = student()) {
  return splitForReveal(await render(markdown, req));
}

const dom = (html) => new JSDOM(html).window.document;
const text = (html) => dom(html).body.textContent.replace(/\s+/g, " ").trim();

before(async () => {
  corpus = mkdtempSync(path.join(os.tmpdir(), "safelearn-obsidian-syntax-"));
  write("assets/diagram.png");
  write(
    "Git.md",
    [
      "# Git",
      "",
      "## Branches",
      "",
      "Branch text.",
      "",
      "### Merging",
      "",
      "Merge text.",
      "",
      "## Tags",
      "",
      "Tag text.",
      "",
    ].join("\n")
  );
  write(
    "Trees.md",
    [
      "Intro paragraph.",
      "",
      "A tree is defined as follows. ^def-tree",
      "",
      "- first item ^first",
      "  continued below",
      "- second item",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "^table-grades",
      "",
      `${fence}java`,
      "int x = 1;",
      "",
      "int y = 2;",
      fence,
      "^code-block",
      "",
    ].join("\n")
  );
  write("Definition Baum.md", "Ein Baum ist ein Graph.\n\n| k | v |\n|---|---|\n| 1 | 2 |\n");
  write("Notes.md", "Embedded sentence.[^1]\n\n[^1]: Embedded note.\n");
  write("Teacher only.md", "@@@ teacher\nTeacher secret paragraph.\n");
  write(
    "Mixed.md",
    ["Shared paragraph.", "", "@@@ teacher", "## Lösung", "", "Hidden answer.", "@@@", "", "Closing paragraph.", ""].join("\n")
  );
  write("Pictures.md", "Picture note.\n\n![[diagram.png]]\n");
  write("A.md", "Text of A.\n\n![[B]]\n");
  write("B.md", "Text of B.\n\n![[A]]\n");
  for (let level = 1; level <= maximumEmbedDepth + 2; level++) {
    write(`Deep${level}.md`, `Level ${level}.\n\n![[Deep${level + 1}]]\n`);
  }
  await scan();
  // Every account lookup answers with the teacher view, so a teacher reads as one;
  // a student holds no role it could widen.
  global.fetch = async () => ({ ok: true, json: async () => ({ attributes: { config: [JSON.stringify({ vt: 1 })] } }) });
});

after(() => {
  global.fetch = originalFetch;
  rmSync(corpus, { recursive: true, force: true });
});

afterEach(() => {
  console.log = originalLog;
});

describe("every heading has a stable anchor", () => {
  test("an anchor is the lowercased text, whitespace as -, punctuation gone, umlauts kept", () => {
    assert.equal(slugify("Übung 3: Größen"), "übung-3-größen");
    assert.equal(slugify("  Hello,   World!  "), "hello-world");
    assert.equal(slugify("snake_case and-dash (x)"), "snake_case-and-dash-x");
    assert.equal(slugify("Ελληνικά Τίτλος"), "ελληνικά-τίτλος");
  });

  test("three equal headings count up from -2, and a render twice gives the same ids", async () => {
    const markdown = "## Übung 3: Größen\n\n### Beispiel\n\n### Beispiel\n\n### Beispiel\n";
    const ids = (html) => Array.from(dom(html).querySelectorAll(".docanchor[id]"), (h) => h.id);
    const first = ids(await render(markdown));
    assert.deepEqual(first, ["ROOT", "übung-3-größen", "beispiel", "beispiel-2", "beispiel-3"]);
    assert.deepEqual(ids(await render(markdown)), first);
  });

  test("a heading whose anchor names a property of document keeps it", async () => {
    const ids = Array.from(dom(await render("## Images\n\n## Links\n\n## Title\n")).querySelectorAll("h2"), (h) => h.id);
    assert.deepEqual(ids, ["images", "links", "title"]);
  });

  test("the Content list is keyed by the same anchors", async () => {
    const req = student();
    await render("## Branches\n\n## Branches\n", req);
    assert.deepEqual(Object.keys(req.contentListing), ["ROOT", "branches", "branches-2"]);
  });
});

describe("a wiki link can name a heading or a block", () => {
  const links = async (markdown) =>
    Array.from(dom(await render(markdown)).querySelectorAll("a"), (a) => [a.textContent, a.getAttribute("href")]);

  test("a heading of another note, nested segments, a block, a missing heading", async () => {
    assert.deepEqual(
      await links("[[Git#Branches]] [[Git#Remote#Branches]] [[Trees#^def-tree]] [[Git#Nonexistent]] [[Git#Branches|see branches]]"),
      [
        ["Git > Branches", "https://learn.example/md/Git.md#branches"],
        ["Git > Remote > Branches", "https://learn.example/md/Git.md#branches"],
        ["Trees > ^def-tree", "https://learn.example/md/Trees.md#block-def-tree"],
        ["Git > Nonexistent", "https://learn.example/md/Git.md#nonexistent"],
        ["see branches", "https://learn.example/md/Git.md#branches"],
      ]
    );
  });

  test("a heading and a block within the page address the page's own anchors", async () => {
    const html = await render("[[#Installation|see installation]] [[#^p1]]\n\n## Installation\n\nText ^p1\n");
    const document = dom(html);
    assert.deepEqual(
      Array.from(document.querySelectorAll("a"), (a) => [a.textContent, a.getAttribute("href")]),
      [
        ["see installation", "#installation"],
        ["^p1", "#block-p1"],
      ]
    );
    assert.ok(document.getElementById("installation"));
    assert.ok(document.getElementById("block-p1"));
  });

  test("a note that does not resolve, and a link in code, stay as written", async () => {
    assert.equal(text(await render("[[Nowhere#Heading]] `[[Git#Branches]]`")), "[[Nowhere#Heading]] [[Git#Branches]]");
  });

  test("a wiki link to an attachment reads as before, its fragment handed on", async () => {
    assert.deepEqual(await links("[[diagram.png]] [[diagram.png#page=3]]"), [
      ["diagram.png", "https://learn.example/md/assets/diagram.png"],
      ["diagram.png#page=3", "https://learn.example/md/assets/diagram.png#page=3"],
    ]);
  });

  test("in a deck, a link within the page addresses the slide", async () => {
    const deck = dom(await renderDeck("## Start\n\nSee [[#Summary]].\n\n## Middle\n\nx\n\n## Summary\n\nEnd.\n"));
    const link = deck.querySelector("a");
    assert.equal(link.getAttribute("href"), "#/summary");
    // Reveal resolves `#/<id>` to the slide holding that id.
    const target = deck.getElementById("summary").closest("body > section");
    assert.equal(target.querySelector("h2")?.textContent, "Summary");
    assert.notEqual(target, link.closest("body > section"));
  });
});

describe("a block reference names a block", () => {
  test("a paragraph, a list item, and a table with the marker on its own line", async () => {
    const html = await render(
      "A paragraph is defined. ^def-tree\n\n- item one ^li-1\n- item two\n\n| a |\n|---|\n| 1 |\n^table-grades\n"
    );
    const document = dom(html);
    assert.equal(document.getElementById("block-def-tree")?.tagName, "P");
    assert.equal(document.getElementById("block-li-1")?.tagName, "LI");
    assert.equal(document.getElementById("block-table-grades")?.tagName, "TABLE");
    assert.doesNotMatch(document.body.textContent, /\^def-tree|\^li-1|\^table-grades/);
    assert.equal(document.querySelectorAll("table tr").length, 2, "the marker line became no table row");
    assert.doesNotMatch(html, /data-block-anchor/);
  });

  test("a caret in code and in 2^10 stays as written", async () => {
    const html = await render(`${fence}\nx ^mask\n${fence}\n\nInline \`y ^mask\` and 2^10\n`);
    assert.match(text(html), /x \^mask/);
    assert.match(text(html), /y \^mask/);
    assert.match(text(html), /2\^10/);
    assert.equal(dom(html).getElementById("block-mask"), null);
  });
});

describe("footnotes", () => {
  const references = (html) => Array.from(dom(html).querySelectorAll("a[data-footnote-ref]"), (a) => a.textContent);
  const notes = (html) =>
    Array.from(dom(html).querySelectorAll("section.footnotes li"), (li) => li.textContent.replace(/↩\d*/g, "").trim());

  test("named labels are numbered by first use, and two references share a number", async () => {
    const html = await render("A[^src] B[^1] C[^src]\n\n[^1]: One.\n[^src]: Source.\n");
    assert.deepEqual(references(html), ["1", "2", "1"]);
    assert.deepEqual(notes(html), ["Source.", "One."]);
    assert.doesNotMatch(text(html), /\[\^1\]:/);
  });

  test("an inline footnote is numbered between two referenced ones", async () => {
    const html = await render("A[^x] B^[inline note] C[^y]\n\n[^x]: X.\n[^y]: Y.\n");
    assert.deepEqual(references(html), ["1", "2", "3"]);
    assert.deepEqual(notes(html), ["X.", "inline note", "Y."]);
  });

  test("an inline footnote keeps a wiki link inside it", async () => {
    const html = await render("Text^[see [[Git]]]\n");
    const note = dom(html).querySelector("section.footnotes li a[href]");
    assert.equal(note.getAttribute("href"), "https://learn.example/md/Git.md");
  });

  test("a reference without a definition stays as written, and so does syntax in code", async () => {
    const html = await render(`Missing[^missing].\n\n${fence}\nx = a[^1] + ^[0-9]\n${fence}\n\n\`b[^1]\`\n\n[^1]: Unused here.\n`);
    assert.match(text(html), /Missing\[\^missing\]\./);
    assert.match(text(html), /x = a\[\^1\] \+ \^\[0-9\]/);
    assert.equal(references(html).length, 0);
    assert.equal(dom(html).querySelector("section.footnotes"), null, "a definition without a reference is not shown");
  });

  test("a definition inside a hidden teacher block leaves the student's reference as written", async () => {
    const markdown = "Claim[^t].\n\n@@@ teacher\n[^t]: Teacher source.\n@@@\n";
    assert.match(text(await render(markdown, student())), /Claim\[\^t\]\./);
    assert.deepEqual(references(await render(markdown, teacher())), ["1"]);
  });

  test("the footnotes' own heading is no entry of the Content list", async () => {
    const req = student();
    await render("## Only\n\nA[^1]\n\n[^1]: One.\n", req);
    assert.deepEqual(Object.keys(req.contentListing), ["ROOT", "only"]);
  });

  test("in a deck, a note stands on the slide of its first reference and not on the last", async () => {
    const deck = dom(await renderDeck("## One\n\nFirst.\n\n## Two\n\nClaim[^n].\n\n## Three\n\nLast.\n\n[^n]: The note.\n"));
    // A slide per heading; the empty one before the first heading is the
    // anchor of the page's top, as in every deck.
    const slides = Array.from(deck.querySelectorAll("body > section")).filter((slide) => slide.querySelector("h2"));
    assert.equal(slides.length, 3);
    assert.equal(deck.querySelectorAll("body > section").length, 4, "the list at the end made no slide of its own");
    assert.match(slides[1].textContent, /The note\./);
    assert.doesNotMatch(slides[2].textContent, /The note\./);
    assert.equal(deck.querySelector("section.footnotes"), null);
    assert.equal(slides[1].querySelector(".footnotes li").getAttribute("value"), "1");
  });
});

describe("math", () => {
  const formulas = (html) => dom(html).querySelectorAll(".katex").length;

  test("an inline and a display formula are typeset", async () => {
    const inline = await render("Pythagoras: $a^2 + b^2 = c^2$.");
    assert.equal(formulas(inline), 1);
    assert.equal(dom(inline).querySelector(".katex-display"), null);
    const display = await render("Before\n\n$$\n\\frac{a}{b}\n$$\n\nAfter");
    assert.ok(dom(display).querySelector(".katex-display .mfrac"));
  });

  test("Obsidian's delimiter rule: brackets and emphasis around a formula", async () => {
    assert.equal(formulas(await render("($x$) **$y$** $z$-Achse")), 3);
  });

  test("prices, an escaped dollar, a digit after the closing dollar and code stay text", async () => {
    const html = await render("Kostet $5 und $10. \\$x\\$ and $x$5 and `$HOME`\n\n" + `${fence}sh\necho "$a $b"\n${fence}\n`);
    assert.equal(formulas(html), 0);
    assert.match(text(html), /Kostet \$5 und \$10\. \$x\$ and \$x\$5 and \$HOME/);
    assert.match(text(html), /echo "\$a \$b"/);
  });

  test("a formula that does not parse shows its source as an error, and the page goes on", async () => {
    const html = await render("$\\frac{a$\n\nThe next paragraph.");
    const error = dom(html).querySelector(".katex-error");
    assert.ok(error);
    assert.equal(error.textContent, "\\frac{a");
    assert.match(text(html), /The next paragraph\./);
    const unknown = dom(await render("$\\notacommand{x}$"));
    assert.match(unknown.body.textContent, /\\notacommand/);
  });

  test("the sanitizer leaves the typeset output as it is", async () => {
    const marked = new Marked({ async: true, gfm: true, breaks: true });
    marked.use(...obsidianMarkedExtensions());
    const source = "$a^2 + \\sqrt{b}$, $$\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$$ and $\\frac{a$";
    const html = await marked.parse(source);
    // Compared as parsed documents: the sanitizer re-serializes, which spells
    // an entity or an empty element differently and changes nothing.
    assert.equal(dom(sanitizeHtml(html)).body.innerHTML, dom(html).body.innerHTML);
    assert.match(html, /<math/);
  });
});

describe("note embeds", () => {
  test("a whole note is inserted in place, with its table", async () => {
    const html = await render("Before.\n\n![[Definition Baum]]\n\nAfter.\n");
    assert.match(text(html), /^Before\. Ein Baum ist ein Graph\. k v 1 2 After\.$/);
    assert.ok(dom(html).querySelector("table"));
  });

  test("a section runs to the next heading of the same level, its headings in the Content list", async () => {
    const req = student();
    const html = await render("![[Git#Branches]]\n", req);
    assert.match(text(html), /Branches Branch text\. Merging Merge text\./);
    assert.doesNotMatch(text(html), /Tags|Tag text/);
    assert.deepEqual(Object.keys(req.contentListing), ["ROOT", "branches", "merging"]);
  });

  test("a block: a paragraph, a list item, a table and a code block, each without its marker", async () => {
    assert.equal(text(await render("![[Trees#^def-tree]]")), "A tree is defined as follows.");
    assert.match(text(await render("![[Trees#^first]]")), /^first item\s*continued below$/);
    assert.equal(dom(await render("![[Trees#^table-grades]]")).querySelectorAll("tr").length, 2);
    assert.match(text(await render("![[Trees#^code-block]]")), /int x = 1;\s*int y = 2;/);
  });

  test("a missing note, a missing heading or block, and an embed in code stay as written", async () => {
    assert.equal(text(await render("![[Does not exist]]")), "![[Does not exist]]");
    assert.equal(text(await render("![[Git#Nope]]")), "![[Git#Nope]]");
    assert.equal(text(await render("![[Trees#^nope]]")), "![[Trees#^nope]]");
    assert.equal(text(await render("`![[Git]]`")), "![[Git]]");
  });

  test("an attachment embed renders as it always did", async () => {
    assert.ok(dom(await render("![[diagram.png]]")).querySelector('img[src$="/md/assets/diagram.png"]'));
  });

  test("an image in an embedded note is part of the page that embeds it", async () => {
    assert.ok(dom(await render("![[Pictures]]")).querySelector('img[src$="/md/assets/diagram.png"]'));
  });

  test("footnotes of the host and of the embedded note stay two notes", async () => {
    const html = await render("Host sentence.[^1]\n\n![[Notes]]\n\n[^1]: Host note.\n");
    const notes = Array.from(dom(html).querySelectorAll("section.footnotes li"), (li) => li.textContent);
    assert.equal(notes.length, 2);
    assert.match(notes[0], /Host note\./);
    assert.match(notes[1], /Embedded note\./);
  });

  test("a teacher-only note: a student's embed reads as a missing one, a teacher's shows it", async () => {
    assert.equal(text(await render("![[Teacher only]]", student())), "![[Teacher only]]");
    assert.equal(text(await render("![[Teacher only]]", teacher())), "Teacher secret paragraph.");
  });

  test("a teacher block inside the embedded note is filtered for the reader", async () => {
    const shown = text(await render("![[Mixed]]", student()));
    assert.match(shown, /Shared paragraph\. Closing paragraph\./);
    assert.doesNotMatch(shown, /Hidden answer|Lösung/);
    assert.match(text(await render("![[Mixed]]", teacher())), /Hidden answer/);
  });

  test("a section that stands inside a hidden block reads as a missing one", async () => {
    assert.equal(text(await render("![[Mixed#Lösung]]", student())), "![[Mixed#Lösung]]");
    assert.match(text(await render("![[Mixed#Lösung]]", teacher())), /Lösung Hidden answer\./);
  });

  test("an embed inside a hidden block of the host is not resolved", async () => {
    assert.equal(text(await render("@@@ teacher\n![[Definition Baum]]\n@@@\nVisible.\n", student())), "Visible.");
  });

  test("a cycle ends: A shows B, and inside it A's embed as written", async () => {
    const html = await render("Text of A.\n\n![[B]]\n", student("A.md"));
    assert.equal(text(html), "Text of A. Text of B. ![[A]]");
  });

  test("embeds nest five deep and no deeper", async () => {
    const shown = text(await render("![[Deep1]]"));
    for (let level = 1; level <= maximumEmbedDepth; level++) {
      assert.match(shown, new RegExp(`Level ${level}\\.`));
    }
    assert.doesNotMatch(shown, new RegExp(`Level ${maximumEmbedDepth + 1}\\.`));
    assert.match(shown, new RegExp(`!\\[\\[Deep${maximumEmbedDepth + 1}\\]\\]`));
  });
});
