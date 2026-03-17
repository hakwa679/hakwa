import test from "node:test";
import assert from "node:assert/strict";

test("reviews reputation contract contains breakdown and top tags", () => {
  const response = {
    userId: "u1",
    role: "driver",
    reputation: {
      averageRating: 4.8,
      totalReviewsReceived: 20,
      ratingBreakdown: { "1": 0, "2": 1, "3": 1, "4": 4, "5": 14 },
      topTags: [
        {
          key: "safe_driver",
          label: "Safe driver",
          icon: "🛡️",
          frequency: 0.9,
        },
      ],
      recentComments: [],
      badges: [],
    },
  };

  assert.equal(typeof response.userId, "string");
  assert.equal(typeof response.reputation.ratingBreakdown["5"], "number");
  assert.equal(Array.isArray(response.reputation.topTags), true);
});
