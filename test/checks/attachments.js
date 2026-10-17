/**
 * Which session is served which attachment under `/md`, against a running
 * instance and the real realm.
 *
 * Reads `md/test-attachments.md` and `md/test-attachments-teachers.md`, whose
 * images are named after the case they stand for, and walks every page of the
 * corpus for the content half at the end. `test/attachments.test.js` covers what
 * a live corpus cannot hold without being bent out of shape: removing a
 * reference, adding a file between scans, the unreferenced report and the grant
 * store itself.
 *
 * Every request is answered by the application's own decision, so the status
 * alone says little: a refused attachment falls through to the catch-all, which
 * redirects to the start page, exactly like a path with no file behind it. A
 * request is therefore "served" when it answers 200 with the attachment's type
 * and was not redirected.
 *
 * Most requests here are made without rendering the page first, so no grant
 * exists and the full decision answers. Where a check renders, it says why.
 *
 * This is a module, not a test file: `test/content.test.js` imports it.
 */

import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { before, describe, test } from "node:test";

import { applicationUrl, setPreferences, sharedSession } from "../harness.js";

const corpusRoot = path.join(path.resolve(import.meta.dirname, "..", ".."), "md");

const fixturePage = "/md/test-attachments.md";

/** The fixture's attachments, by the case each stands for. */
const attachment = {
  public: "/md/assets/test-attachment-public.png",
  shared: "/md/assets/test-attachment-shared.png",
  teacher: "/md/assets/test-attachment-teacher.png",
  window: "/md/assets/test-attachment-window.png",
  exam: "/md/assets/test-attachment-exam.png",
  unreferenced: "/md/assets/test-attachment-unreferenced.png",
  ambiguousA: "/md/assets/attachments-a/test-attachment-ambiguous.png",
  ambiguousB: "/md/assets/attachments-b/test-attachment-ambiguous.png",
};

/** A path under `/md` where no file exists, the shape of "not there". */
const missing = "/md/assets/no-file-at-this-path-5c1e9a.png";

/** Every Markdown file of the corpus, as the path the application serves it on. */
function corpusPages(directory = corpusRoot, collected = []) {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) corpusPages(full, collected);
    else if (path.extname(entry) === ".md") {
      collected.push("/md/" + path.relative(corpusRoot, full).split(path.sep).join("/"));
    }
  }
  return collected.sort();
}

/** Requests `reference` from inside the page, with the session's cookies. */
async function request(session, reference) {
  return session.page.evaluate(async (address) => {
    try {
      const response = await fetch(address, { credentials: "include" });
      const buffer = await response.arrayBuffer();
      return {
        status: response.status,
        redirected: response.redirected,
        servedFrom: response.url,
        contentType: response.headers.get("content-type"),
        cacheControl: response.headers.get("cache-control"),
        bytes: buffer.byteLength,
      };
    } catch (error) {
      return { error: String(error) };
    }
  }, new URL(reference, applicationUrl).href);
}

/**
 * Sends a GET from the test process with the session's cookies and without
 * following a redirect, so every header and the body of the answer itself can
 * be compared.
 */
async function requestUnfollowed(session, reference) {
  const cookies = await session.page.cookies(applicationUrl);
  const response = await fetch(new URL(reference, applicationUrl), {
    redirect: "manual",
    headers: { cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") },
  });
  const headers = Object.fromEntries(
    [...response.headers].filter(([name]) => name.toLowerCase() !== "date")
  );
  return { status: response.status, headers, body: await response.text() };
}

/** Whether an answer is the attachment itself rather than the catch-all. */
const served = (answer) =>
  !answer.error && answer.status === 200 && !answer.redirected && answer.bytes > 0;

function assertServed(session, reference, why) {
  return request(session, reference).then((answer) => {
    assert.ok(
      served(answer),
      `${reference} should be served to the ${session.role} session (${why}), but answered ` +
        `${answer.error ?? `${answer.status}${answer.redirected ? `, redirected to ${answer.servedFrom}` : ""}`}`
    );
    return answer;
  });
}

function assertRefused(session, reference, why) {
  return request(session, reference).then((answer) => {
    assert.ok(!answer.error, `${reference} could not be requested at all: ${answer.error}`);
    assert.ok(
      !served(answer),
      `${reference} should not be served to the ${session.role} session (${why}), but it was`
    );
  });
}

/**
 * The attachment URLs a page's body addresses on this application, as the
 * browser resolves them. Read from the presentation view: its body is the same
 * rendered Markdown, and unlike the two page views it does not write
 * `lastVisitedUrl` back to the shared account after answering.
 */
async function attachmentsOf(session, pagePath) {
  return session.page.evaluate(
    async (address, origin) => {
      const response = await fetch(address, { credentials: "include" });
      const html = await response.text();
      const document = new DOMParser().parseFromString(html, "text/html");
      const root = document.querySelector("#revealContent") ?? document.body;
      const found = new Set();
      for (const element of root.querySelectorAll("[src], [href], [poster]")) {
        for (const name of ["src", "href", "poster"]) {
          const value = element.getAttribute(name);
          if (!value) continue;
          let url;
          try {
            url = new URL(value, address);
          } catch {
            continue;
          }
          const last = url.pathname.split("/").pop();
          if (
            url.origin === origin &&
            url.pathname.startsWith("/md/") &&
            last.includes(".") &&
            !last.toLowerCase().endsWith(".md")
          ) {
            found.add(url.pathname);
          }
        }
      }
      return [...found];
    },
    `${applicationUrl}${encodeURI(pagePath)}?reveal=true`,
    new URL(applicationUrl).origin
  );
}

describe("attachment access", () => {
  let student;
  let teacher;

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
  });

  test("an attachment referenced on an unrestricted page is served to every session", async () => {
    for (const session of [student, teacher]) {
      await assertServed(session, attachment.public, "it is embedded outside any block");
    }
  });

  test("an attachment referenced only inside a teacher block is served to teachers only", async () => {
    await assertRefused(student, attachment.teacher, "its only reference is in a @@@ teacher block");
    await assertServed(teacher, attachment.teacher, "teachers see the block");
  });

  test("an attachment referenced in several places is as visible as the most visible one", async () => {
    for (const session of [student, teacher]) {
      await assertServed(
        session,
        attachment.shared,
        "one of its references, beside a 4bhif block and a teacher page, is unrestricted"
      );
    }
  });

  test("an attachment whose only reference is inside a closed window is not served", async () => {
    await assertRefused(teacher, attachment.window, "its block's window closed on 2025-01-02");
  });

  test("a teacher in student view is not served what only teachers see", async () => {
    // Rendered first, so the session holds a grant from the teacher view; the
    // switch to the student view has to take that grant away.
    await setPreferences(teacher, { vt: 1 });
    assert.ok(
      (await attachmentsOf(teacher, fixturePage)).includes(attachment.teacher),
      `${fixturePage} rendered for a teacher should embed ${attachment.teacher}`
    );
    await setPreferences(teacher, { vt: 0 });
    try {
      await assertRefused(teacher, attachment.teacher, "the student view hides the teacher block");
    } finally {
      await setPreferences(teacher, { vt: 1 });
    }
  });

  test("an attachment referenced only in the exam variant needs the exam view", async () => {
    await setPreferences(teacher, { ve: 0 });
    await assertRefused(teacher, attachment.exam, "the exam view is off");
    await setPreferences(teacher, { ve: 1 });
    try {
      await assertServed(teacher, attachment.exam, "the exam view is on");
      await setPreferences(student, { ve: 1 });
      await assertRefused(student, attachment.exam, "the exam variant is for teachers only");
    } finally {
      await setPreferences(teacher, { ve: 0 });
      await setPreferences(student, { ve: 0 });
    }
  });

  test("an ambiguous embed makes neither file servable", async () => {
    for (const reference of [attachment.ambiguousA, attachment.ambiguousB]) {
      await assertRefused(teacher, reference, "the embed names neither folder and renders as nothing");
    }
  });

  test("an attachment no page references is served to nobody", async () => {
    for (const session of [student, teacher]) {
      await assertRefused(session, attachment.unreferenced, "nothing in the corpus references it");
    }
  });

  test("a refused attachment is answered exactly like a missing one", async () => {
    for (const [session, refusedPath] of [
      [student, attachment.teacher],
      [teacher, attachment.unreferenced],
    ]) {
      const refused = await requestUnfollowed(session, refusedPath);
      const nothing = await requestUnfollowed(session, missing);
      assert.deepEqual(
        refused,
        nothing,
        `${refusedPath}, refused to the ${session.role} session, should be answered exactly like ` +
          `${missing}, where no file exists: same status, same headers apart from the date, same body`
      );
    }
  });

  test("a served attachment is private to the browser", async () => {
    const answer = await assertServed(student, attachment.public, "it is embedded outside any block");
    assert.match(
      answer.cacheControl ?? "",
      /\bprivate\b/,
      `${attachment.public} should forbid shared caches from storing it, but said "${answer.cacheControl}"`
    );
    assert.doesNotMatch(answer.cacheControl ?? "", /\bpublic\b/);
  });

  test("every attachment a rendered page addresses is served by the full decision", async () => {
    for (const session of [student, teacher]) {
      // Collected first, which records grants; the preference write afterwards
      // drops them again, so every request below is decided from the files.
      const addressed = new Map();
      for (const page of corpusPages()) {
        for (const reference of await attachmentsOf(session, page)) {
          if (!addressed.has(reference)) addressed.set(reference, page);
        }
      }
      assert.ok(addressed.size > 0, "the corpus should address at least one attachment");
      await setPreferences(session, {});

      const refused = [];
      for (const [reference, page] of addressed) {
        if (!served(await request(session, reference))) refused.push(`${reference} (on ${page})`);
      }
      assert.deepEqual(
        refused,
        [],
        `pages rendered for the ${session.role} session address attachments the server then ` +
          `refuses it without a grant. The extractor and the renderer disagree about these.`
      );
    }
  });
});
