import test from "node:test";
import assert from "node:assert/strict";
import { processMapRoadTrace } from "../processors/mapRoadTraceProcessor.ts";

test("road trace processor computes non-negative novel distance and points", () => {
  const result = processMapRoadTrace({
    userId: "user-1",
    tripId: "trip-1",
    trace: [
      { lat: -18.141, lng: 178.441 },
      { lat: -18.142, lng: 178.443 },
      { lat: -18.143, lng: 178.445 },
    ],
  });

  assert.equal(result.userId, "user-1");
  assert.equal(result.tripId, "trip-1");
  assert.equal(result.novelDistanceMeters >= 0, true);
  assert.equal(result.suggestedPoints >= 0, true);
});
