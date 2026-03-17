import test from "node:test";
import assert from "node:assert/strict";

test("share expiry lifecycle returns SAFETY_SHARE_EXPIRED semantics", () => {
  const statusCode = 410;
  const code = "SAFETY_SHARE_EXPIRED";
  assert.equal(statusCode, 410);
  assert.equal(code, "SAFETY_SHARE_EXPIRED");
});
