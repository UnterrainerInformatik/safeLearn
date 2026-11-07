/**
 * The module's shared row colours, unit by unit: which grade is good, bad or
 * neutral, the tone of each state of a test, and the one writer of `data-tone`.
 *
 * No browser, no login, no server: `exam/client/row-tone.js` is the very
 * file the browser loads. The coloured tables against a running instance are
 * `test/exam.test.js`.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { gradeTone, setTone, timingTone } from "../exam/client/row-tone.js";

describe("gradeTone", () => {
  test("1 and 2 are good, 5 is bad, 3 and 4 are neutral, as numbers", () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(gradeTone), ["good", "good", null, null, "bad"]);
  });

  test("the same as strings", () => {
    assert.deepEqual(["1", "2", "3", "4", "5"].map(gradeTone), ["good", "good", null, null, "bad"]);
  });

  test("no grade is neutral", () => {
    assert.equal(gradeTone(null), null);
    assert.equal(gradeTone(undefined), null);
    assert.equal(gradeTone(""), null);
  });
});

describe("timingTone", () => {
  test("every state of a test has its tone", () => {
    assert.deepEqual({ ...timingTone }, { open: "bad", soon: "warn", later: "info", done: "good" });
  });
});

describe("setTone", () => {
  test("sets data-tone and removes it for neutral", () => {
    const element = { dataset: {} };
    setTone(element, "bad");
    assert.equal(element.dataset.tone, "bad");
    setTone(element, "good");
    assert.equal(element.dataset.tone, "good");
    setTone(element, null);
    assert.equal("tone" in element.dataset, false);
    setTone(element, undefined);
    assert.equal("tone" in element.dataset, false);
  });
});
