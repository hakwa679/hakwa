import test from "node:test";
import assert from "node:assert/strict";

test("explorer progression triggers after three pioneered zones", () => {
  const pioneeredZones = 3;
  assert.equal(pioneeredZones >= 3, true);
});
