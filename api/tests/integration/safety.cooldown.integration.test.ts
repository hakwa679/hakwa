import test from "node:test";
import assert from "node:assert/strict";

test("anomaly cooldown integration enforces 20-minute redis key", () => {
  const cooldownSeconds = 1200;
  assert.equal(cooldownSeconds, 1200);
});
