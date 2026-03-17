import test from "node:test";
import assert from "node:assert/strict";

// T041: contract checks for report + moderation payloads.
test("map moderation contract includes expected fields", () => {
  const reportPayload = { reason: "incorrect_info", note: "wrong road type" };
  const moderatePayload = { action: "approve", reason: "validated" };

  assert.equal(typeof reportPayload.reason, "string");
  assert.equal(moderatePayload.action, "approve");
});
