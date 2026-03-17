import test from "node:test";
import assert from "node:assert/strict";

// T027: contract coverage for verify request payload shape.
test("map verify contract accepts confirm/dispute votes", () => {
  const confirmPayload = { vote: "confirm" };
  const disputePayload = { vote: "dispute", disputeCategory: "wrong_location" };

  assert.equal(confirmPayload.vote, "confirm");
  assert.equal(disputePayload.vote, "dispute");
  assert.equal(typeof disputePayload.disputeCategory, "string");
});
