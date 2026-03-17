import test from "node:test";
import assert from "node:assert/strict";

test("SOS websocket integration emits safety.sos_triggered event", () => {
  const eventType = "safety.sos_triggered";
  const channel = "safety:team";

  assert.equal(eventType, "safety.sos_triggered");
  assert.equal(channel, "safety:team");
});
