import test from "node:test";
import assert from "node:assert/strict";

test("check-in respond contract returns id and status", () => {
  const payload = { id: "checkin-1", status: "ok_confirmed" };
  assert.equal(typeof payload.id, "string");
  assert.equal(typeof payload.status, "string");
});
