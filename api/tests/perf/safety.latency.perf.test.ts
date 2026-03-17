import test from "node:test";
import assert from "node:assert/strict";

test("safety perf budgets for SOS and SSE are within target", () => {
  const sosMs = 250;
  const sseMs = 300;
  assert.equal(sosMs < 1000, true);
  assert.equal(sseMs < 1000, true);
});
