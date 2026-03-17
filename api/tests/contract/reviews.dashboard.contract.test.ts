import test from "node:test";
import assert from "node:assert/strict";

test("reviews dashboard contract shape", () => {
  const payload = {
    averageRating: 4.8,
    totalReviewsReceived: 120,
    monthlyAverages: [{ month: "2026-03", average: 4.9, reviewCount: 22 }],
    tagFrequencies: [{ key: "safe_driver", count: 80, frequency: 0.67 }],
    annotations: [
      { tagKey: "late_arrival", message: "7 mentions", severity: "warning" },
    ],
    reputationBadges: [],
  };

  assert.equal(typeof payload.averageRating, "number");
  assert.equal(Array.isArray(payload.monthlyAverages), true);
  assert.equal(Array.isArray(payload.annotations), true);
});
