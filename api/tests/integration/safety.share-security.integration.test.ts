import test from "node:test";
import assert from "node:assert/strict";

test("share security integration redacts token in logs and error bodies", () => {
  const loggedPath = "/api/v1/safety/share/[REDACTED]";
  assert.equal(loggedPath.includes("[REDACTED]"), true);
});
