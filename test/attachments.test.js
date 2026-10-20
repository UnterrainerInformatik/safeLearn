/**
 * Which attachment a page addresses, and who is served it, decided by the code
 * that decides it.
 *
 * Unit-level, in the shape of `test/permission-context.test.js`: a fixture corpus
 * is written to a temporary directory and scanned with `scanFiles`, sessions are
 * plain objects carrying their roles as LDAP groups, and `fetch` is stubbed for
 * the one account lookup a permission context makes. No server, no browser, no
 * login. `test/checks/attachments.js` asserts the same rule against a running
 * instance and the real realm; what this file adds is the edge cases a live
 * corpus would have to be bent out of shape to contain, the unreferenced report,
 * and the grant store.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, describe, test } from "node:test";

import {
  dropAttachmentGrants,
  extractAttachmentReferences,
  hasAttachmentGrant,
  manipulateHtml,
  mayServeAttachment,
  preParse,
  recordAttachmentGrants,
  resolveAttachment,
  resolveAttachmentReference,
  scanFiles,
  unreferencedAttachments,
} from "../obsidian.js";
import { sanitizeHtml } from "../sanitize.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalFetch = global.fetch;
const originalLog = console.log;

let corpus;

/** Writes `content` to `relative` inside the fixture corpus. */
function write(relative, content = "x") {
  const target = path.join(corpus, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/** Scans the fixture corpus, returning what the scan logged. */
async function scan() {
  const logged = [];
  console.log = (...args) => logged.push(args.map(String).join(" "));
  try {
    await scanFiles("md/", corpus);
  } finally {
    console.log = originalLog;
  }
  return logged.filter((line) => line.startsWith("[Attachments]"));
}

/** A session as passport leaves it on `req`, carrying `groups` as LDAP roles. */
function session(groups, name) {
  return {
    protocol: "https",
    get: (header) => (header.toLowerCase() === "host" ? "learn.example" : undefined),
    originalUrl: "/md/page.md",
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

const student = () => session({ student: true }, "Stu Dent");
const classMember = () => session({ student: true, "4bhif": true }, "Kla Ssen");
const teacher = () => session({ teacher: true }, "Tea Cher");

/** Answers every account lookup with these view preferences. */
function preferences(values) {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ attributes: { config: [JSON.stringify(values)] } }),
  });
}

before(async () => {
  corpus = mkdtempSync(path.join(os.tmpdir(), "safelearn-attachments-"));
  write("assets/public.png");
  write("assets/teacher-only.png");
  write("assets/everywhere.png");
  write("assets/window.png");
  write("assets/exam.png");
  write("assets/sized.png");
  write("assets/absolute.pdf");
  write("assets/old.pdf");
  write("assets/in-code.png");
  write("one/diagram.png");
  write("two/diagram.png");
  write("folder/img/relative.png");
  write("ex/Solution.java");
  write("assets/linked.pdf");
  write("assets/teacher-linked.pdf");
  write("one/handout.pdf");
  write("two/handout.pdf");

  write(
    "page.md",
    [
      "# Page",
      "![[public.png]]",
      "![[sized.png|300x200]]",
      "![[diagram.png]]",
      "![[one/diagram.png]]",
      "![abs](/md/assets/absolute.pdf)",
      "![external](https://example.org/x.png)",
      "Inline `![[in-code.png]]` is an example.",
      "```",
      "![[in-code.png]]",
      "```",
      "@@@ teacher",
      "![[teacher-only.png]]",
      "@@@",
      "@@@ teacher[2025-01-01T00:00:00 to 2025-01-02T00:00:00]",
      "![[window.png]]",
      "@@@",
      "@@@ #exam",
      "![[exam.png]]",
      "@@@",
      "",
    ].join("\n")
  );
  write("teachers.md", "@@@ teacher\n# Teachers\n![[everywhere.png]]\n");
  write("class.md", "# Class\n@@@ 4bhif\n![[everywhere.png]]\n@@@\n");
  write("open.md", "# Open\n![[everywhere.png]]\n");
  write(
    "wikilinks.md",
    [
      "# Wiki links",
      "[[linked.pdf]] beside [[page]] and [[handout.pdf]] and [[two/handout.pdf|Two]]",
      "@@@ teacher",
      "[[teacher-linked.pdf|Sheet]]",
      "@@@",
      "",
    ].join("\n")
  );
  write("folder/page.md", "# Folder\n![x](img/relative.png)\n![escape](../../outside.png)\n");
  await scan();
});

afterEach(() => {
  global.fetch = originalFetch;
  console.log = originalLog;
});

after(async () => {
  // Scanned once more, empty: the closed window above started the visibility
  // timer, and a scan that finds no window is what stops it again.
  rmSync(corpus, { recursive: true, force: true });
  mkdirSync(corpus);
  await scan();
  rmSync(corpus, { recursive: true, force: true });
});

describe("what a page addresses", () => {
  test("an embed is recorded with and without its size", () => {
    const references = extractAttachmentReferences("![[a.png]] and ![[b.png|300x200]] and ![[c.png|300]]");
    assert.deepEqual(
      references.map(({ raw, kind }) => ({ raw, kind })),
      [
        { raw: "a.png", kind: "embed" },
        { raw: "b.png", kind: "embed" },
        { raw: "c.png", kind: "embed" },
      ]
    );
    assert.equal(references[1].offset, "![[a.png]] and ".length);
  });

  test("Markdown images, links, definitions and raw tags are recorded", () => {
    const markdown = [
      "![x](img/a.png)",
      "[doc](/md/assets/b.pdf \"title\")",
      "[ref]: <files/c d.zip>",
      '<img src="/md/assets/d.png"> <video poster=\'e.jpg\' src="f.mp4"></video>',
      '<a href="g.pdf">g</a>',
    ].join("\n");
    assert.deepEqual(
      extractAttachmentReferences(markdown).map(({ raw, kind }) => ({ raw, kind })),
      [
        { raw: "img/a.png", kind: "image" },
        { raw: "/md/assets/b.pdf", kind: "link" },
        { raw: "files/c d.zip", kind: "link" },
        { raw: "/md/assets/d.png", kind: "html" },
        { raw: "e.jpg", kind: "html" },
        { raw: "f.mp4", kind: "html" },
        { raw: "g.pdf", kind: "html" },
      ]
    );
  });

  test("external URLs, Markdown pages, other mounts and fragments are no references", () => {
    const markdown = [
      "![e](https://example.org/a.png)",
      "[p](other.md) [p2](/md/x.md#h) [f](#section) [m](mailto:a@b.c)",
      "[s](/css/main.css) [n](//cdn.example/x.png)",
      '<img src="http://example.org/x.png">',
      "[^1]: a footnote",
    ].join("\n");
    assert.deepEqual(extractAttachmentReferences(markdown), []);
  });

  test("a reference inside fenced or inline code is no reference", () => {
    const markdown = [
      "Write `![[a.png]]` to embed.",
      "```markdown",
      "![[b.png]]",
      "![x](c.png)",
      "```",
      "~~~~",
      "<img src=\"d.png\">",
      "~~~~",
      "![[e.png]]",
    ].join("\n");
    assert.deepEqual(
      extractAttachmentReferences(markdown).map(({ raw }) => raw),
      ["e.png"]
    );
  });

  test("a wiki link is recorded by its name, without text or corpus prefix", () => {
    const markdown = [
      "[[a.pdf]] and [[md/b.pdf|Text]] and | [[c.pdf\\|Cell]] |",
      "![[d.png]] is an embed, not a wiki link.",
      "`[[e.pdf]]`",
      "```",
      "[[f.pdf]]",
      "```",
    ].join("\n");
    assert.deepEqual(
      extractAttachmentReferences(markdown).map(({ raw, kind }) => ({ raw, kind })),
      [
        { raw: "a.pdf", kind: "wikilink" },
        { raw: "b.pdf", kind: "wikilink" },
        { raw: "c.pdf", kind: "wikilink" },
        { raw: "d.png", kind: "embed" },
      ]
    );
  });
});

describe("which attachment a reference addresses", () => {
  test("an embed resolves by basename, with or without a corpus prefix", () => {
    assert.equal(resolveAttachment("public.png"), "assets/public.png");
    assert.equal(resolveAttachment("md/public.png"), "assets/public.png");
    assert.equal(resolveAttachment("/md/assets/public.png"), "assets/public.png");
    assert.equal(resolveAttachment("missing.png"), null);
  });

  test("an ambiguous basename resolves to nothing unless the full path names one", () => {
    assert.equal(resolveAttachment("diagram.png"), null);
    assert.equal(resolveAttachment("one/diagram.png"), "one/diagram.png");
  });

  test("a relative path is resolved against the referencing file's folder", () => {
    const [reference] = extractAttachmentReferences("![x](img/relative.png)");
    assert.equal(resolveAttachmentReference(reference, "folder"), "folder/img/relative.png");
    assert.equal(resolveAttachmentReference(reference, ""), null);
  });

  test("a /md/ path is resolved from the corpus root, percent-encoding decoded", () => {
    write("assets/with space.png");
    return scan().then(() => {
      const [reference] = extractAttachmentReferences("![x](/md/assets/with%20space.png)");
      assert.equal(resolveAttachmentReference(reference, "folder"), "assets/with space.png");
    });
  });

  test("a wiki link resolves as an embed does, and a page name to no attachment", () => {
    const resolve = (markdown) =>
      extractAttachmentReferences(markdown).map((reference) => resolveAttachmentReference(reference, "folder"));
    assert.deepEqual(resolve("[[linked.pdf]] [[md/linked.pdf|Text]] [[page]] [[missing.pdf]]"), [
      "assets/linked.pdf",
      "assets/linked.pdf",
      null,
      null,
    ]);
    assert.deepEqual(resolve("[[handout.pdf]] [[two/handout.pdf]]"), [null, "two/handout.pdf"]);
  });

  test("a path that leaves the corpus addresses nothing", () => {
    for (const markdown of ["![x](../../app.js)", "![x](/md/../app.js)", "![x](../outside.png)"]) {
      const [reference] = extractAttachmentReferences(markdown);
      assert.equal(resolveAttachmentReference(reference, "folder"), null, markdown);
    }
  });
});

describe("what the renderer makes of an embed", () => {
  test("an embed in prose becomes an image, one in code stays text", () => {
    const html = [
      "<p>![[public.png]]</p>",
      "<p>Write <code>![[public.png]]</code> to embed.</p>",
      '<pre class="shiki"><code><span>![[public.png]]</span></code></pre>',
    ].join("\n");
    const rendered = manipulateHtml(html, student());
    assert.equal((rendered.match(/<img /g) ?? []).length, 1, rendered);
    assert.equal((rendered.match(/!\[\[public\.png\]\]/g) ?? []).length, 2, rendered);
  });
});

describe("what the renderer makes of a PDF embed", () => {
  test("a placeholder with its size and an encoded link, both kept by the sanitizer", async () => {
    write("assets/mündliche RDP.pdf");
    await scan();
    const html = "<p>![[mündliche RDP.pdf]]</p>\n<p>![[mündliche RDP.pdf|600x400]]</p>";
    const rendered = sanitizeHtml(manipulateHtml(html, student()));
    const url = "https://learn.example/md/assets/m%C3%BCndliche%20RDP.pdf";
    const link = `<a href="${url}">mündliche RDP.pdf</a>`;
    assert.ok(rendered.includes(`<div class="sl-pdf" data-src="${url}">${link}</div>`), rendered);
    assert.ok(
      rendered.includes(`<div class="sl-pdf" data-src="${url}" data-width="600px" data-height="400px">${link}</div>`),
      rendered
    );
  });
});

describe("what the renderer makes of a wiki link", () => {
  test("a wiki link to an attachment becomes a Markdown link to its encoded path", async () => {
    write("assets/mündliche RDP.pdf");
    await scan();
    const markdown = [
      "[[linked.pdf]]",
      "[[linked.pdf|Arbeitsblatt]]",
      "[[mündliche RDP.pdf]]",
      "[[handout.pdf]]",
      "[[one/handout.pdf]]",
      "[[missing.pdf]]",
      "`[[linked.pdf]]`",
    ].join("\n\n");
    const lines = (await preParse(markdown, student())).split("\n\n");
    assert.deepEqual(lines, [
      "[linked.pdf](https://learn.example/md/assets/linked.pdf)",
      "[Arbeitsblatt](https://learn.example/md/assets/linked.pdf)",
      "[mündliche RDP.pdf](https://learn.example/md/assets/m%C3%BCndliche%20RDP.pdf)",
      "[[handout.pdf]]",
      "[one/handout.pdf](https://learn.example/md/one/handout.pdf)",
      "[[missing.pdf]]",
      "`[[linked.pdf]]`",
    ]);
  });
});

describe("who is served an attachment", () => {
  test("a reference on an unrestricted page serves everyone", async () => {
    preferences({ vt: 1 });
    assert.equal(await mayServeAttachment(student(), "assets/public.png"), true);
    assert.equal(await mayServeAttachment(teacher(), "assets/public.png"), true);
    assert.equal(await mayServeAttachment(student(), "assets/sized.png"), true);
    assert.equal(await mayServeAttachment(student(), "assets/absolute.pdf"), true);
    assert.equal(await mayServeAttachment(student(), "folder/img/relative.png"), true);
  });

  test("a reference only inside a teacher block serves teachers only", async () => {
    preferences({ vt: 1 });
    assert.equal(await mayServeAttachment(student(), "assets/teacher-only.png"), false);
    assert.equal(await mayServeAttachment(teacher(), "assets/teacher-only.png"), true);
  });

  test("a wiki link serves its attachment where the link is visible", async () => {
    preferences({ vt: 1 });
    assert.equal(await mayServeAttachment(student(), "assets/linked.pdf"), true);
    assert.equal(await mayServeAttachment(student(), "assets/teacher-linked.pdf"), false);
    assert.equal(await mayServeAttachment(teacher(), "assets/teacher-linked.pdf"), true);
    assert.equal(await mayServeAttachment(teacher(), "one/handout.pdf"), false);
    assert.equal(await mayServeAttachment(teacher(), "two/handout.pdf"), true);
  });

  test("a teacher in student view is not served what only teachers see", async () => {
    preferences({ vt: 0 });
    assert.equal(await mayServeAttachment(teacher(), "assets/teacher-only.png"), false);
  });

  test("a reference inside a closed window serves nobody", async () => {
    preferences({ vt: 1 });
    assert.equal(await mayServeAttachment(teacher(), "assets/window.png"), false);
  });

  test("a reference only in the exam variant needs the exam view", async () => {
    // The exam variant is for teachers only, and for them only in the exam view.
    preferences({ vt: 1, ve: 0 });
    assert.equal(await mayServeAttachment(teacher(), "assets/exam.png"), false);
    preferences({ vt: 1, ve: 1 });
    assert.equal(await mayServeAttachment(teacher(), "assets/exam.png"), true);
    assert.equal(await mayServeAttachment(student(), "assets/exam.png"), false);
  });

  test("an ambiguous embed makes neither file servable", async () => {
    preferences({ vt: 1 });
    assert.equal(await mayServeAttachment(teacher(), "two/diagram.png"), false);
    assert.equal(await mayServeAttachment(teacher(), "one/diagram.png"), true);
  });

  test("a reference inside code makes nothing servable", async () => {
    preferences({ vt: 1 });
    assert.equal(await mayServeAttachment(teacher(), "assets/in-code.png"), false);
  });

  test("several references are as visible as the most visible of them", async () => {
    preferences({ vt: 1 });
    for (const req of [student(), classMember(), teacher()]) {
      assert.equal(await mayServeAttachment(req, "assets/everywhere.png"), true);
    }
    write("open.md", "# Open\nNo longer embeds anything.\n");
    await scan();
    try {
      assert.equal(await mayServeAttachment(student(), "assets/everywhere.png"), false);
      assert.equal(await mayServeAttachment(classMember(), "assets/everywhere.png"), true);
      assert.equal(await mayServeAttachment(teacher(), "assets/everywhere.png"), true);
    } finally {
      write("open.md", "# Open\n![[everywhere.png]]\n");
      await scan();
    }
  });

  test("an attachment added after the page that embeds it is found by the next scan", async () => {
    preferences({ vt: 1 });
    write("later.md", "# Later\n![[new.png]]\n");
    await scan();
    assert.equal(await mayServeAttachment(student(), "assets/new.png"), false);
    write("assets/new.png");
    await scan();
    assert.equal(await mayServeAttachment(student(), "assets/new.png"), true);
  });
});

describe("the unreferenced report", () => {
  test("names every unreferenced attachment, sorted, and their count", async () => {
    const logged = await scan();
    const { scannedAt, paths } = unreferencedAttachments();
    assert.ok(scannedAt instanceof Date);
    // `window.png` is referenced, if only inside a closed window: the report
    // names what no page mentions, not what nobody may see right now.
    assert.deepEqual(paths, [
      "assets/in-code.png",
      "assets/mündliche RDP.pdf",
      "assets/old.pdf",
      "assets/with space.png",
      "ex/Solution.java",
      "one/handout.pdf",
      "two/diagram.png",
    ]);
    assert.deepEqual(
      logged,
      [...paths.map((p) => `[Attachments] unreferenced: ${p}`), `[Attachments] ${paths.length} unreferenced attachment(s)`]
    );
  });

  test("a page referencing one drops it from the next report", async () => {
    const before = unreferencedAttachments();
    assert.ok(before.paths.includes("assets/old.pdf"));
    write("cites-old.md", "# Cites\n![[old.pdf]]\n");
    const logged = await scan();
    try {
      const report = unreferencedAttachments();
      assert.ok(!report.paths.includes("assets/old.pdf"));
      assert.ok(!logged.includes("[Attachments] unreferenced: assets/old.pdf"));
      assert.ok(report.scannedAt >= before.scannedAt);
      assert.notEqual(report, before, "the report is replaced as a whole, never mutated");
    } finally {
      rmSync(path.join(corpus, "cites-old.md"));
      await scan();
    }
  });

  test("every path in the report is refused to every session", async () => {
    preferences({ vt: 1, ve: 1, va: 1 });
    const { paths } = unreferencedAttachments();
    assert.ok(paths.length > 0);
    for (const attachment of paths) {
      for (const req of [student(), classMember(), teacher()]) {
        assert.equal(await mayServeAttachment(req, attachment), false, attachment);
        assert.equal(hasAttachmentGrant(req, attachment), false, attachment);
      }
    }
  });
});

describe("render-time grants", () => {
  const body = [
    '<img src="https://learn.example/md/assets/public.png" alt="public.png">',
    '<img src="img/relative.png">',
    '<a href="https://learn.example/md/assets/absolute.pdf?x=1&amp;y=2">pdf</a>',
    '<img src="https://elsewhere.example/md/assets/sized.png">',
    '<a href="/md/folder/page.md">page</a>',
    '<img src="/md/assets/missing.png">',
    '<a href="/css/main.css">css</a>',
  ].join("\n");

  test("grant exactly the attachments the body addresses on this origin", () => {
    const req = student();
    req.originalUrl = "/md/folder/page.md?document=true";
    recordAttachmentGrants(req, body);
    assert.deepEqual(Object.keys(req.session.attachmentGrants).sort(), [
      "assets/absolute.pdf",
      "assets/public.png",
      "folder/img/relative.png",
    ]);
    assert.equal(hasAttachmentGrant(req, "assets/public.png"), true);
    assert.equal(hasAttachmentGrant(req, "assets/sized.png"), false);
  });

  test("a grant expires after its lifetime and expired grants are pruned on write", () => {
    const req = student();
    recordAttachmentGrants(req, body);
    req.session.attachmentGrants["assets/public.png"].expiresAt = Date.now() - 1;
    assert.equal(hasAttachmentGrant(req, "assets/public.png"), false);
    recordAttachmentGrants(req, "<p>nothing</p>");
    assert.ok(!("assets/public.png" in req.session.attachmentGrants));
    assert.ok("assets/absolute.pdf" in req.session.attachmentGrants);
  });

  test("a scan invalidates every grant", async () => {
    const req = student();
    recordAttachmentGrants(req, body);
    assert.equal(hasAttachmentGrant(req, "assets/public.png"), true);
    await scan();
    assert.equal(hasAttachmentGrant(req, "assets/public.png"), false);
  });

  test("writing preferences drops the session's grants", () => {
    const req = student();
    recordAttachmentGrants(req, body);
    dropAttachmentGrants(req);
    assert.equal(hasAttachmentGrant(req, "assets/public.png"), false);
  });

  test("only the corpus page handler records grants", () => {
    // Source-level, because the property is about who calls: any other caller
    // of the renderer - Markdown that is not a corpus file - must not be one.
    const source = readFileSync(path.join(projectRoot, "app.js"), "utf8");
    const calls = source.match(/recordAttachmentGrants\(/g) ?? [];
    assert.equal(calls.length, 1, "app.js should record grants in exactly one place");
    const call = source.indexOf("recordAttachmentGrants(req, html)");
    const guard = source.lastIndexOf("filePath.startsWith(corpusRoot)", call);
    assert.ok(guard !== -1 && call - guard < 400, "the one call should sit behind the corpus check");
  });
});
