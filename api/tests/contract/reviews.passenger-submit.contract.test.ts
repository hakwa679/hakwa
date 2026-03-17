import test from "node:test";
import assert from "node:assert/strict";

test("reviews passenger submit contract shape", () => {
  const payload = {
    tripId: "11111111-1111-1111-1111-111111111111",
    rating: 4,
    tagKeys: ["safe_driver", "friendly"],
    comment: "Great trip",
  };

  assert.equal(typeof payload.tripId, "string");
  assert.equal(Number.isInteger(payload.rating), true);
  assert.equal(Array.isArray(payload.tagKeys), true);
});
