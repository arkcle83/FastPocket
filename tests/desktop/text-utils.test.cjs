const test = require("node:test");
const assert = require("node:assert/strict");
const { splitSegments, formatDuration } = require("../../renderer/text-utils.js");

test("splitSegments preserves explicit lines", () => {
  assert.deepEqual(splitSegments("Une ligne.\n\nDeuxième ligne."), ["Une ligne.", "Deuxième ligne."]);
});

test("splitSegments divides long paragraphs on sentence boundaries", () => {
  const segments = splitSegments("Première phrase assez longue. Deuxième phrase assez longue.", 35);
  assert.deepEqual(segments, ["Première phrase assez longue.", "Deuxième phrase assez longue."]);
});

test("splitSegments normalizes whitespace and ignores empty input", () => {
  assert.deepEqual(splitSegments("   "), []);
  assert.deepEqual(splitSegments("  Bonjour    Tristan.  "), ["Bonjour Tristan."]);
});

test("splitSegments hard-wraps an unpunctuated line before the backend limit", () => {
  const source = "a".repeat(5000);
  const segments = splitSegments(source);
  assert.ok(segments.length > 1);
  assert.ok(segments.every((segment) => segment.length <= 360));
  assert.equal(segments.join(""), source);
});

test("formatDuration returns a stable clock", () => {
  assert.equal(formatDuration(65.8), "01:05");
  assert.equal(formatDuration(Number.NaN), "00:00");
});
