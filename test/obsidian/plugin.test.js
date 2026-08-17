/**
 * What the SafeLearn plugin does inside Obsidian.
 *
 * This suite measures; it does not repair. The plugin has known defects - they
 * are written up in `AI/proposals/plugin-fix-editor-decorations.md` - and the
 * point of these checks is that those defects become observable before anyone
 * claims to have fixed them. An assertion here that asserted the behavior we
 * *want* rather than the behavior there *is* would fail today for the right
 * reason and pass tomorrow for the wrong one, so where today's behavior is
 * wrong, the check says so in its name and asserts the wrongness.
 *
 * Run with `npm run test:obsidian`. It opens a real Obsidian window, needs no
 * login and starts no server.
 */

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  markers,
  obsidianVersion,
  open,
  placeCursorAfter,
  reveal,
  screenshot,
  shutdown,
  start,
  type,
  views,
  visibleText,
} from "./harness.js";

const FRAGMENTS = "test-md-file.md";
const PSEUDO_ROLES = "test-exam-practice-question.md";
const FILE_DIRECTIVE = "test-fileperms-window-closed.md";

/**
 * Runs a check and, if it fails, leaves an image of what was on screen before
 * rethrowing with the path appended. A defect about what something looks like,
 * reported as an assertion message alone, cannot be judged afterwards - the
 * server harness attaches a screenshot to a failed login for the same reason.
 */
async function watched(name, body) {
  try {
    await body();
  } catch (failure) {
    let shot = null;
    try {
      shot = await screenshot(name);
    } catch {
      // A screenshot that cannot be taken must not replace the real failure.
    }
    if (shot) failure.message += `\n  A screenshot of this is at ${shot}.`;
    throw failure;
  }
}

before(async () => {
  await start();
  console.log(`    Obsidian ${obsidianVersion()}`);
});

after(async () => {
  await shutdown();
});

describe("the plugin is loaded and decorating", () => {
  test("a corpus file in live preview carries the plugin's own markers", async () =>
    watched("loaded", async () => {
      const container = await open(FRAGMENTS, views.livePreview);
      const found = await markers(container);
      assert.ok(
        found.length > 0,
        `The plugin put none of its classes on ${FRAGMENTS} in live preview. Either it did not ` +
          `load, or it decorated nothing - both are the harness's problem before they are the ` +
          `plugin's.`
      );
    }));
});

describe("each view state is reachable and distinct", () => {
  test("live preview shows the editor", async () =>
    watched("live-preview", async () => {
      const container = await open(FRAGMENTS, views.livePreview);
      assert.equal(container, ".cm-content");
      await reveal(container, "Fragmented Text.");
      assert.ok((await visibleText(container)).includes("Fragmented Text."));
    }));

  test("source mode shows the editor", async () =>
    watched("source", async () => {
      const container = await open(FRAGMENTS, views.source);
      assert.equal(container, ".cm-content");
      await reveal(container, "Fragmented Text.");
      assert.ok((await visibleText(container)).includes("Fragmented Text."));
    }));

  test("reading view shows rendered output", async () =>
    watched("reading", async () => {
      const container = await open(FRAGMENTS, views.reading);
      assert.equal(container, ".markdown-reading-view");
      await reveal(container, "Fragmented Text.");
      assert.ok((await visibleText(container)).includes("Fragmented Text."));
    }));
});

describe("the tags the corpus carries", () => {
  test("a permission block is decorated in the editor", async () =>
    watched("permission-block", async () => {
      const container = await open(PSEUDO_ROLES, views.livePreview);
      const found = await markers(container);
      assert.ok(
        found.some((m) => m.marker === "permission-block"),
        `No permission-block marker on ${PSEUDO_ROLES}, which opens with @@@ #exam.`
      );
    }));

  test("a side-by-side block is decorated in the editor", async () =>
    watched("side-by-side", async () => {
      const container = await open(FRAGMENTS, views.livePreview);
      await reveal(container, "##side-by-side-start");
      const found = await markers(container);
      assert.ok(
        found.some((m) => m.marker.startsWith("side-by-side")),
        `No side-by-side marker on ${FRAGMENTS}, which holds two such blocks.`
      );
    }));

  test("a file-level directive on line 1 is not treated as one", async () =>
    watched("file-directive", async () => {
      const container = await open(FILE_DIRECTIVE, views.livePreview);
      const found = await markers(container);
      // The first line of this file gates the whole file and has no closing
      // `@@@`. The plugin has no notion of that form: it opens a block that
      // never closes, so nothing is marked at all. Asserted rather than merely
      // logged, because it is exactly what `plugin-edit-tag-support` has to
      // change, and that change should see this check turn red.
      assert.deepEqual(
        found,
        [],
        "Something is decorated on a file whose only directive is the line-1 form. If the plugin " +
          "has learned that form, this check has done its job - rewrite it to assert the new " +
          "behavior."
      );
    }));
});

describe("known defects, as they behave today", () => {
  test("DEFECT: a bare ##fragment is decorated one character too wide", async () =>
    watched("defect-fragment-width", async () => {
      const container = await open(FRAGMENTS, views.livePreview);
      await reveal(container, "Fragmented Text.");
      const fragments = (await markers(container)).filter((m) => m.marker === "fragment-highlight");

      assert.ok(
        fragments.length > 0,
        "No fragment-highlight markers at all. If the decoration range overran the line, " +
          "CodeMirror may have rejected the whole set - which is the same defect, louder."
      );

      // `main.ts` computes the end as `from + "##fragment ".length` - always 11 -
      // even when what matched is the bare `##fragment`, which is 10. Line 157
      // of the corpus file is exactly that bare form.
      const overwide = fragments.filter(
        (m) => m.text.trimEnd() === "##fragment" && m.length > "##fragment".length
      );
      assert.ok(
        overwide.length > 0,
        "Expected a fragment decoration covering more than the token it belongs to. If this " +
          "fails, the defect it documents is gone - delete the check and say so in " +
          "plugin-fix-editor-decorations."
      );
    }));

  test("DEFECT: typing after a fragment marker drags the decoration along", async () =>
    watched("defect-fragment-typing", async () => {
      const container = await open(FRAGMENTS, views.livePreview);
      await reveal(container, "Fragmented Text.");
      const before = (await markers(container)).filter((m) => m.marker === "fragment-highlight");

      // Type at the end of the bare marker line, the way a person adding a word
      // after a tag would. The decoration is what this observes, not the text.
      await placeCursorAfter("Fragmented Text.");
      await type("x");
      const after = (await markers(container)).filter((m) => m.marker === "fragment-highlight");

      // Recorded as an assertion so the next change can see it move: today the
      // marker widths are what the over-wide range above produces, and an edit
      // on a neighbouring line is enough to rebuild them. What must never
      // happen is that decorating stops altogether after an edit.
      assert.ok(
        after.length > 0,
        `Typing one character removed every fragment decoration (before: ${before.length}). ` +
          `That is the decoration set failing to rebuild, not a narrower one.`
      );
    }));
});
