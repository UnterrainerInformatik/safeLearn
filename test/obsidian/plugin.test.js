/**
 * What the SafeLearn plugin does inside Obsidian.
 *
 * These checks state the behavior the plugin is supposed to have, not the
 * behavior it happens to have. Where the two disagree the check is red, and the
 * repair is what turns it green - which is the whole reason the harness was
 * built before the repair was written. Three checks here previously asserted
 * today's defects on purpose so that a repair would turn them red; they were
 * rewritten in place by `plugin-fix-editor-decorations` rather than deleted, so
 * the coverage they carried is still here.
 *
 * A few checks are green before the repair as well. They are not idle: each
 * states a requirement that no single line of the repair produces on its own -
 * a scroll shows the right markings today because the plugin decorates the whole
 * document, and stops doing so for free once decorations are emitted per
 * viewport. Those are the checks that notice when a repair is done halfway.
 *
 * Run with `npm run test:obsidian`. It opens a real Obsidian window, needs no
 * login and starts no server.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import {
  closeExtraViews,
  corpusPath,
  documentText,
  forgetRaised,
  markers,
  moveCursorInto,
  obsidianVersion,
  open,
  placeCursorAfter,
  plantInRenderedView,
  plantedText,
  provokeError,
  raised,
  reveal,
  screenshot,
  scrollTo,
  shutdown,
  start,
  type,
  vaultPath,
  views,
  visibleText,
  writeDocument,
} from "./harness.js";

const FRAGMENTS = "test-md-file.md";
const PSEUDO_ROLES = "test-exam-practice-question.md";

/** The one form the renderer acts on, and therefore the only one that may be marked. */
const FRAGMENT = "##fragment";

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

/** Every marking of one kind, in document order, as `L<line>C<column>:"<text>"`. */
function shapeOf(found, kind) {
  return found
    .filter((m) => (kind ? m.marker === kind : true))
    .sort((a, b) => (a.from ?? 0) - (b.from ?? 0))
    .map((m) => `L${m.line}C${m.column}:${JSON.stringify(m.text)}`);
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
});

// ################### That the harness reports what it claims to ###################

describe("the harness reports what it claims to", () => {
  // Everything below this point rests on these three. A collector that reports
  // nothing whatever happens, or a vault write that reached the corpus, would
  // make the checks after it meaningless rather than wrong - which is worse.

  test("an error raised in the renderer is reported, on both channels", async () =>
    watched("harness-error-channel", async () => {
      forgetRaised();
      await provokeError("harness self-check");
      const seen = raised();
      forgetRaised();

      assert.ok(
        seen.some((e) => e.kind === "console.error" && e.text.includes("harness self-check")),
        `A console error was raised and the harness did not report it. Collected: ` +
          `${JSON.stringify(seen)}`
      );
      assert.ok(
        seen.some((e) => e.kind === "pageerror" && e.text.includes("harness self-check")),
        `An uncaught error was raised and the harness did not report it. The ordering defect ` +
          `arrives on the console channel, but a defect that escapes Obsidian's own handlers ` +
          `arrives here, and a collector watching one channel would miss the other. Collected: ` +
          `${JSON.stringify(seen)}`
      );
    }));

  test("a document a check constructs is in the run's vault and not in the corpus", async () =>
    watched("harness-constructed-document", async () => {
      const name = "constructed-harness-self-check.md";
      await writeDocument(name, "Written by a check, into the disposable vault.\n");

      assert.ok(
        existsSync(path.join(vaultPath(), name)),
        `${name} was written but is not in the run's vault at ${vaultPath()}.`
      );
      assert.ok(
        !existsSync(path.join(corpusPath(), name)),
        `${name} reached the corpus at ${corpusPath()}. The corpus is what the authenticated ` +
          `suite asserts against, and a plugin check must not be able to change it.`
      );
    }));

  test("a document a check tries to write outside the vault is refused", async () =>
    watched("harness-vault-escape", async () => {
      await assert.rejects(
        () => writeDocument("../../md/written-by-a-plugin-check.md", "x"),
        /outside the run's vault/,
        "A check was able to name a path outside the vault. The guard is the only thing standing " +
          "between a typo in a check and a rewritten corpus."
      );
      assert.ok(
        !existsSync(path.join(corpusPath(), "written-by-a-plugin-check.md")),
        "The refused write reached the corpus anyway."
      );
    }));
});

// ################### A decoration covers exactly the tag it marks ###################

describe("a decoration covers exactly the tag it marks", () => {
  test("every fragment marking covers the tag and not what follows it", async () =>
    watched("fragment-extent", async () => {
      const container = await open(FRAGMENTS, views.livePreview);
      await reveal(container, "Fragmented Text.");
      const fragments = (await markers(container)).filter((m) => m.marker === "fragment-highlight");

      assert.ok(
        fragments.length > 0,
        "No fragment-highlight markers at all. If a decoration range was malformed, the editor " +
          "may have rejected the whole set - which is the same defect, louder. See the check for " +
          "a well-formed set."
      );

      const wrong = fragments.filter((m) => m.text !== FRAGMENT);
      assert.deepEqual(
        wrong.map((m) => `L${m.line}C${m.column}:${JSON.stringify(m.text)} (${m.length} chars)`),
        [],
        `A fragment marking covers something other than ${JSON.stringify(FRAGMENT)}. The extent ` +
          `has to come from the text that matched: the corpus writes the tag both at the end of a ` +
          `line and followed by a space, and the space is not part of the tag. ${FRAGMENT} is ` +
          `${FRAGMENT.length} characters, never ${FRAGMENT.length + 1}.`
      );
    }));

  test("a tag ending its line is covered exactly, and the next line is untouched", async () =>
    watched("fragment-end-of-line", async () => {
      const name = "constructed-end-of-line.md";
      await writeDocument(name, ["##fragment", "Text after it.", "", "##fragment"].join("\n"));
      const container = await open(name, views.livePreview);

      assert.deepEqual(
        shapeOf(await markers(container), "fragment-highlight"),
        [`L1C0:${JSON.stringify(FRAGMENT)}`, `L4C0:${JSON.stringify(FRAGMENT)}`],
        "A tag standing at the end of its line is marked from its first character to its last, " +
          "and nothing on the line after it is marked. A decoration whose end is computed from an " +
          "assumed spelling of the tag reaches past the line it is on."
      );
    }));
});

// ################### A decoration stays on its tag while the document is edited ###################

describe("a decoration stays on its tag while the document is edited", () => {
  test("typing at the end of a tag's line leaves the marking on the tag", async () =>
    watched("fragment-typing-same-line", async () => {
      const name = "constructed-typing.md";
      await writeDocument(name, ["Alpha ##fragment beta", "Gamma ##fragment delta"].join("\n"));
      const container = await open(name, views.livePreview);
      const before = shapeOf(await markers(container), "fragment-highlight");

      await placeCursorAfter("Alpha ##fragment beta");
      await type("x");

      const after = shapeOf(await markers(container), "fragment-highlight");
      assert.deepEqual(
        after,
        before,
        `Typing at the end of a line that carries a tag changed which text is marked. Before: ` +
          `${JSON.stringify(before)}. The typed character is not part of the tag and no marking ` +
          `may grow to include it.`
      );
      assert.deepEqual(
        after,
        [`L1C6:${JSON.stringify(FRAGMENT)}`, `L2C6:${JSON.stringify(FRAGMENT)}`],
        "Each tag is marked where it stands, covering itself and nothing else."
      );
    }));

  test("inserting a line above a tag moves the marking with it", async () =>
    watched("fragment-typing-earlier-line", async () => {
      const name = "constructed-inserting.md";
      await writeDocument(name, ["Alpha ##fragment beta", "Gamma ##fragment delta"].join("\n"));
      const container = await open(name, views.livePreview);

      // Split the first line in two, which pushes everything below it down by
      // one. The second tag has not been touched and must not have stayed behind
      // at the position it used to occupy.
      await placeCursorAfter("Alpha ##fragment beta");
      await type("\n");

      assert.deepEqual(
        shapeOf(await markers(container), "fragment-highlight"),
        [`L1C6:${JSON.stringify(FRAGMENT)}`, `L3C6:${JSON.stringify(FRAGMENT)}`],
        "A line was inserted above the second tag, so that tag is now on line 3. A marking that " +
          "still reports line 2 stayed at an offset rather than following its text."
      );
    }));
});

// ################### What is marked reflects the document as it is currently shown ###################

describe("what is marked reflects the document as it is currently shown", () => {
  test("a tag scrolled to for the first time is marked, with no edit", async () =>
    watched("scroll-into-view", async () => {
      const container = await open(FRAGMENTS, views.livePreview);
      // Deliberately not `reveal`: that moves the cursor to the line first, so a
      // plugin that only reacts to the cursor would pass a check meant for
      // scrolling.
      const scrolled = await scrollTo("##side-by-side-start");

      assert.equal(
        scrolled.changed,
        false,
        "Scrolling changed the document text. Then the check no longer says what it claims to: a " +
          "plugin that only rebuilds on an edit would pass it."
      );
      const found = await markers(container);
      assert.ok(
        found.some((m) => m.marker.startsWith("side-by-side")),
        "A block was scrolled into view for the first time in this session and carries no " +
          "marking. Marking has to be brought up to date when the visible region changes, not " +
          "only when the text does."
      );
    }));

  test("a block that opens above the viewport still marks what is on screen", async () =>
    watched("block-above-the-viewport", async () => {
      // Long enough that its opening marker is off screen once the middle of it
      // is reached. Marking only what is visible is fine; deciding what is
      // *inside a block* from only what is visible is not, because the line that
      // opened it is three screens up.
      const filler = Array.from({ length: 120 }, (_, i) => `Line ${i + 1} of gated content.`);
      const name = "constructed-long-block.md";
      await writeDocument(
        name,
        ["Intro.", "@@@ teacher", ...filler, "##fragment", ...filler, "@@@", "", "After it."].join("\n")
      );
      const container = await open(name, views.livePreview);
      const marked = await scrollTo(FRAGMENT);

      assert.equal(marked.changed, false, "Scrolling changed the document text.");
      const found = await markers(container);
      assert.ok(
        found.some((m) => m.marker === "fragment-highlight" && m.text === FRAGMENT),
        `The tag in the middle of the block is not marked. Found: ${JSON.stringify(shapeOf(found))}`
      );
      assert.ok(
        found.some((m) => m.marker === "permission-block"),
        "Lines in the middle of the block are not marked as being in one. The marker that opened " +
          "it is far above the viewport, so a scan that looks only at what is on screen cannot " +
          "know they are inside anything."
      );
    }));

  test("the cursor entering a tag changes no text and leaves the tag marked", async () =>
    watched("cursor-into-tag", async () => {
      const name = "constructed-cursor.md";
      await writeDocument(name, ["Alpha ##fragment beta", "", "Gamma."].join("\n"));
      const container = await open(name, views.livePreview);

      const moved = await moveCursorInto(FRAGMENT);
      assert.equal(
        moved.changed,
        false,
        "Moving the cursor changed the document text, so this check no longer distinguishes a " +
          "rebuild on a cursor move from a rebuild on an edit."
      );

      assert.deepEqual(
        shapeOf(await markers(container), "fragment-highlight"),
        [`L1C6:${JSON.stringify(FRAGMENT)}`],
        "With the cursor inside it, the tag is still marked and its own characters are still " +
          "there to be edited."
      );
      assert.ok(
        (await visibleText(container)).includes(FRAGMENT),
        "The tag's characters are not on screen while the cursor is in them, so a person cannot " +
          "edit the tag they are standing in."
      );
    }));
});

// ################### A tag the plugin cannot resolve costs only itself ###################

describe("a tag the plugin cannot resolve costs only itself", () => {
  test("a file-level directive on line 1 does not swallow the block below it", async () =>
    watched("file-directive", async () => {
      // No corpus file carries a line-1 directive *and* tags below it, so this
      // one is assembled here - see the modified fixture requirement in
      // `plugin-verification`. The first line gates the whole file and has no
      // closing marker; everything below it is ordinary and must be marked
      // ordinarily. The directive itself gains no marking of its own in this
      // change - that is `plugin-edit-tag-support`.
      const name = "constructed-file-directive.md";
      await writeDocument(
        name,
        [
          "@@@ teacher",
          "",
          "@@@ 4bhif",
          "Gated.",
          "@@@",
          "",
          "##fragment",
          "Text.",
          "",
          "##side-by-side-start",
          "left",
          "##separator",
          "right",
          "##side-by-side-end",
        ].join("\n")
      );
      const container = await open(name, views.livePreview);
      const found = await markers(container);

      assert.deepEqual(
        shapeOf(found, "permission-block"),
        [`L3C0:${JSON.stringify("@@@ 4bhif")}`, `L4C0:${JSON.stringify("Gated.")}`, `L5C0:${JSON.stringify("@@@")}`],
        "The permission block a person wrote is lines 3 to 5. A file-level directive on line 1 " +
          "has no closing marker and must open no block at all - read as one, it swallows the " +
          "lines above the real block and the marking starts two lines too early."
      );
      assert.deepEqual(
        shapeOf(found, "fragment-highlight"),
        [`L7C0:${JSON.stringify(FRAGMENT)}`],
        "The fragment below the directive is marked."
      );
      assert.ok(
        found.some((m) => m.marker === "side-by-side-start") &&
          found.some((m) => m.marker === "side-by-side-separator") &&
          found.some((m) => m.marker === "side-by-side-end"),
        `The side-by-side block below the directive is marked. Found: ${JSON.stringify(shapeOf(found))}`
      );
    }));

  test("an unterminated block leaves the tags after it marked", async () =>
    watched("unterminated-block", async () => {
      const name = "constructed-unterminated.md";
      await writeDocument(
        name,
        ["Intro.", "@@@ teacher", "Gated.", "", "##fragment", "Text."].join("\n")
      );
      const container = await open(name, views.livePreview);
      const found = await markers(container);

      assert.deepEqual(
        shapeOf(found, "fragment-highlight"),
        [`L5C0:${JSON.stringify(FRAGMENT)}`],
        "A block that is never closed must cost itself and nothing else."
      );
      assert.ok(
        found.some((m) => m.marker === "permission-block" && m.line === 2),
        `A block that opens on line 2 and is never closed still opened. It ends at the end of the ` +
          `document and marks what it covered, rather than being dropped. Found: ` +
          `${JSON.stringify(shapeOf(found))}`
      );
    }));

  test("a closing marker with nothing open does not turn what follows into a block", async () =>
    watched("orphaned-closing-marker", async () => {
      const name = "constructed-orphan.md";
      await writeDocument(
        name,
        ["Intro.", "@@@", "##fragment", "Text.", "", "@@@ teacher", "Gated.", "@@@"].join("\n")
      );
      const container = await open(name, views.livePreview);
      const found = await markers(container);

      assert.deepEqual(
        shapeOf(found, "permission-block"),
        [
          `L6C0:${JSON.stringify("@@@ teacher")}`,
          `L7C0:${JSON.stringify("Gated.")}`,
          `L8C0:${JSON.stringify("@@@")}`,
        ],
        "The bare marker on line 2 opens nothing - it names no roles, so there is no block for it " +
          "to be the start of. The block on lines 6 to 8 is the only one in this document."
      );
      assert.deepEqual(
        shapeOf(found, "fragment-highlight"),
        [`L3C0:${JSON.stringify(FRAGMENT)}`],
        "The tag after the orphaned marker is marked as it would be in a document without it."
      );
    }));
});

// ################### The set of decorations is always well-formed ###################

describe("the set of decorations is always well-formed", () => {
  test("a line marking and a tag marking at one position are both applied", async () =>
    watched("decoration-set-ordering", async () => {
      // The one shape the editor's decoration machinery rejects: a whole-line
      // marking and a character-level marking beginning at the same offset. No
      // corpus file puts a tag at the start of a line inside a block, which is
      // why this document is constructed - and why the defect has been invisible.
      //
      // The block starts on line 2 rather than line 1 on purpose: a `@@@` on the
      // first line is the file-level form and opens no block, so it would be a
      // document with nothing to collide.
      const name = "constructed-collision.md";
      await writeDocument(
        name,
        ["Intro.", "@@@ teacher", "##fragment", "Gated text.", "@@@", "", "After it."].join("\n")
      );
      forgetRaised();
      const container = await open(name, views.livePreview);
      const found = await markers(container);
      const errors = raised();

      assert.deepEqual(
        errors.map((e) => `${e.kind}: ${e.text.split("\n")[0]}`),
        [],
        "The editor refused the set of markings. A rejected set is not a degraded result: every " +
          "marking in the document is lost at once, which reads from the outside exactly like a " +
          "document with nothing to mark. The set has to be ordered by position and by the side " +
          "each range starts at, and only the library knows the second."
      );
      assert.ok(
        found.some((m) => m.marker === "permission-block" && m.line === 3) &&
          found.some((m) => m.marker === "fragment-highlight" && m.line === 3),
        `Both markings belong on line 3 - the block covers it and the tag stands on it. Found: ` +
          `${JSON.stringify(shapeOf(found))}`
      );
    }));

  test("no corpus document raises an error while being opened, edited and scrolled", async () =>
    watched("corpus-raises-nothing", async () => {
      const corpus = readdirSync(corpusPath()).filter((name) => name.endsWith(".md"));
      assert.ok(corpus.length > 0, `No documents in the corpus at ${corpusPath()}.`);

      for (const name of corpus) {
        forgetRaised();
        const container = await open(name, views.livePreview);
        const lines = ((await documentText()) ?? "").split("\n").filter((l) => l.trim() !== "");
        if (lines.length > 0) await scrollTo(lines[lines.length - 1]);
        await placeCursorAfter(lines[0] ?? "");
        await type("x");

        const errors = raised();
        assert.deepEqual(
          errors.map((e) => `${e.kind}: ${e.text.split("\n")[0]}`),
          [],
          `Opening, scrolling and editing ${name} raised something. No document the project ships ` +
            `may make the editor raise anything while it is being marked.`
        );
      }
    }));
});

// ################### Recognition does not depend on when or in what order ###################

describe("whether something is a tag does not depend on when it is examined", () => {
  test("the same document examined twice reports the same markings", async () =>
    watched("stable-recognition", async () => {
      // Short enough to be on screen whole, so that what is being compared is
      // two examinations of the same lines and not two viewports.
      const name = "constructed-stability.md";
      await writeDocument(
        name,
        ["Alpha ##fragment beta", "##fragment", "- ##fragment two", "Gamma."].join("\n")
      );
      const container = await open(name, views.livePreview);
      const first = shapeOf(await markers(container), "fragment-highlight");
      assert.ok(first.length > 0, "Nothing was marked, so there is nothing to be stable about.");

      // Two more examinations, provoked without touching the text: a rebuild
      // that carries state from the previous one answers differently.
      await moveCursorInto("Gamma.");
      const second = shapeOf(await markers(container), "fragment-highlight");
      await moveCursorInto("Alpha");
      const third = shapeOf(await markers(container), "fragment-highlight");

      assert.deepEqual(
        [second, third],
        [first, first],
        "The same lines gave different answers on different examinations. Recognition that " +
          "carries state between them - a global regular expression asked whether it matches, " +
          "which remembers where it stopped - answers differently every second time."
      );
    }));

  test("a line carrying two fragments has both marked", async () =>
    watched("two-tags-one-line", async () => {
      const name = "constructed-two-tags.md";
      await writeDocument(name, "one ##fragment two ##fragment three\n");
      const container = await open(name, views.livePreview);

      assert.deepEqual(
        shapeOf(await markers(container), "fragment-highlight"),
        [`L1C4:${JSON.stringify(FRAGMENT)}`, `L1C19:${JSON.stringify(FRAGMENT)}`],
        "The renderer acts on every occurrence in a line. A scan that asks where the tag is, " +
          "rather than walking the line, finds only the first - so the second is text the server " +
          "acts on and the person writing it was never shown."
      );
    }));
});

// ################### What is marked is what the server will act on ###################

describe("what is marked is what the server will act on", () => {
  test("a fragment the server acts on is marked, one it ignores is not", async () =>
    watched("recognition-matches-the-server", async () => {
      // The renderer's rule is `/##fragment(?=\s|$)/g`: case-sensitive, anywhere
      // in the line, wherever whitespace or the end of the text follows. So the
      // list item on line 3 *is* a fragment marker to the server - the corpus
      // writes it that way - and the two above it are not.
      const name = "constructed-recognition.md";
      await writeDocument(
        name,
        ["##FRAGMENT", "##fragment.", "- ##fragment two", "##fragment"].join("\n")
      );
      const container = await open(name, views.livePreview);

      assert.deepEqual(
        shapeOf(await markers(container), "fragment-highlight"),
        [`L3C2:${JSON.stringify(FRAGMENT)}`, `L4C0:${JSON.stringify(FRAGMENT)}`],
        "Marked text has to be text the server acts on. `##FRAGMENT` and `##fragment.` are not " +
          "fragments to the server, and marking them tells a person the opposite. `- ##fragment " +
          "two` is one, and leaving it unmarked - or marking the space after it - misinforms in " +
          "the other direction."
      );
    }));
});

// ################### The reading view, before the editor stops reaching into it ###################

describe("the reading view", () => {
  test("the rendered view does not show the tag text", async () =>
    watched("reading-view-tags", async () => {
      // Recorded rather than designed: the reading view's own repair is
      // `plugin-render-hide-tags`, and this change only removes the editor's
      // reach into rendered output. What the post-processor does *by itself* is
      // written down here first, so that removing the editor's call either
      // leaves this green or turns it red with the reason visible - rather than
      // becoming a mystery in the next change.
      const container = await open(FRAGMENTS, views.reading);
      await reveal(container, "Fragmented Text.");
      const shown = await visibleText(container);

      assert.ok(
        !shown.includes(FRAGMENT),
        "The rendered reading view still shows the raw tag text. If this turned red when the " +
          "editor stopped rewriting rendered output, the editor's call was masking a " +
          "post-processor that does not work on its own - a finding for plugin-render-hide-tags, " +
          "to be recorded there rather than repaired by restoring the call."
      );
      assert.ok(
        !shown.includes("##side-by-side"),
        "The rendered reading view still shows the raw side-by-side markers."
      );
    }));
});

// ################### The editor does not modify rendered output ###################

describe("the editor does not modify rendered output", () => {
  // Last in the file on purpose: it is the only check that puts a second
  // document on screen, and the window is narrower afterwards than the ones
  // before it assume.

  test("typing in the editor leaves a rendered view beside it alone", async () =>
    watched("editor-reaching-into-rendered-output", async () => {
      try {
        const reading = await open(FRAGMENTS, views.reading);
        await reveal(reading, "Fragmented Text.");

        // Beside it rather than in place of it, because that is the situation the
        // requirement is about: a rendered view of one document open while
        // another is being written.
        await open(PSEUDO_ROLES, views.livePreview, { beside: true });

        const planted = await plantInRenderedView("##fragment planted by a check");
        await placeCursorAfter("# Question 23");
        await type("x");

        assert.equal(
          await plantedText(),
          planted,
          "Typing in the editor changed text in a rendered view of another document. Marking in " +
            "the editor and hiding tags in the reading view are separate mechanisms with separate " +
            "triggers; an editor that rewrites rendered DOM on every keystroke is the wrong " +
            "mechanism in the wrong place, and the reading view's own repair is " +
            "plugin-render-hide-tags."
        );
      } finally {
        await closeExtraViews();
      }
    }));
});
