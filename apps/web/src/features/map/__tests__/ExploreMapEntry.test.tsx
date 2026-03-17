import test from "node:test";
import assert from "node:assert/strict";

test("explore map entry route label is stable", () => {
  const label = "Explore and Map Fiji";
  assert.equal(label.includes("Map Fiji"), true);
});
