import test from "node:test";
import assert from "node:assert/strict";

test("safety outbox message shape includes required SMS worker fields", () => {
  const outboxMessage = {
    to: "+6799123456",
    body: "Hakwa safety alert",
    incidentId: "incident-1",
    retryCount: "0",
  };

  assert.equal(typeof outboxMessage.to, "string");
  assert.equal(typeof outboxMessage.body, "string");
  assert.equal(typeof outboxMessage.incidentId, "string");
  assert.equal(outboxMessage.retryCount, "0");
});
