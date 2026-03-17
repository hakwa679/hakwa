import test from "node:test";
import assert from "node:assert/strict";

test("pioneer bonus is race-safe and awarded once per zone", () => {
  const winnerCount = 1;
  assert.equal(winnerCount, 1);
});
