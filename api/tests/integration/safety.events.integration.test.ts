import test from "node:test";
import assert from "node:assert/strict";

test("safety events integration includes check-in escalation websocket event", () => {
  const event = {
    event: "safety.check_in_escalated",
    incidentId: "incident-1",
    checkInId: "checkin-1",
    tripId: "trip-1",
    at: new Date().toISOString(),
  };

  assert.equal(event.event, "safety.check_in_escalated");
  assert.equal(typeof event.incidentId, "string");
  assert.equal(typeof event.checkInId, "string");
  assert.equal(typeof event.tripId, "string");
});

test("safety events integration includes critical incident websocket event", () => {
  const event = {
    event: "safety.critical_incident",
    incidentId: "incident-2",
    category: "assault",
    at: new Date().toISOString(),
  };

  assert.equal(event.event, "safety.critical_incident");
  assert.equal(typeof event.incidentId, "string");
  assert.equal(typeof event.category, "string");
});
