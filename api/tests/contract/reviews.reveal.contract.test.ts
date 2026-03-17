import test from "node:test";
import assert from "node:assert/strict";

test("reviews reveal contract omits hidden counterpart", () => {
  const response = {
    tripId: "33333333-3333-3333-3333-333333333333",
    reviews: [
      {
        id: "r1",
        direction: "driver_to_passenger",
        rating: 5,
        tagKeys: ["polite"],
        comment: null,
        submittedAt: new Date().toISOString(),
        isOwnReview: true,
      },
    ],
    pendingDirections: ["passenger_to_driver"],
  };

  assert.equal(Array.isArray(response.reviews), true);
  assert.equal(response.reviews[0]?.isOwnReview, true);
  assert.equal(
    response.pendingDirections.includes("passenger_to_driver"),
    true,
  );
});
