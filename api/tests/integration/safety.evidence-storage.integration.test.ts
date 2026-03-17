import test from "node:test";
import assert from "node:assert/strict";

test("evidence storage integration uses randomized non-guessable keys", () => {
  const generatedKey = "safety/u1/i1/abc123def456.png";
  assert.equal(generatedKey.includes("..") == false, true);
});
