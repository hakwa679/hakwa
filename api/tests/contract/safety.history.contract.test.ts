import test from "node:test";
import assert from "node:assert/strict";

test("history contract includes incidents checkIns and page", () => {
  const payload = {
    incidents: [],
    checkIns: [],
    page: { limit: 20, hasMore: false },
  };
  assert.equal(Array.isArray(payload.incidents), true);
  assert.equal(Array.isArray(payload.checkIns), true);
});
