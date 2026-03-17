import test from "node:test";
import assert from "node:assert/strict";

test("reviews driver submit contract shape", () => {
  const payload = {
    tripId: "22222222-2222-2222-2222-222222222222",
    rating: 5,
    tagKeys: ["polite", "ready_on_time"],
  };

  assert.equal(typeof payload.tripId, "string");
  assert.equal(payload.rating >= 1 && payload.rating <= 5, true);
  assert.equal(payload.tagKeys.length >= 1, true);
});
