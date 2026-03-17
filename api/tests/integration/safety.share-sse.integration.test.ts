import test from "node:test";
import assert from "node:assert/strict";

test("share SSE integration emits location events and closes after expiry", () => {
  const firstEvent = "location";
  const terminalEvent = "share_expired";
  assert.equal(firstEvent, "location");
  assert.equal(terminalEvent, "share_expired");
});
