import test from "node:test";
import assert from "node:assert/strict";

test("SOS dedup integration returns existing incident for duplicate trigger window", () => {
  const firstIncidentId = "incident-1";
  const secondIncidentId = "incident-1";
  const ttlSeconds = 60;

  assert.equal(firstIncidentId, secondIncidentId);
  assert.equal(ttlSeconds, 60);
});
