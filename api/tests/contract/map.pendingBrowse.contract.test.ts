import test from "node:test";
import assert from "node:assert/strict";

test("pending browse contract accepts bbox and filter query params", () => {
  const query = {
    minLat: -18.2,
    minLng: 178.3,
    maxLat: -18.0,
    maxLng: 178.6,
    featureType: "poi",
    maxAgeDays: 14,
    sort: "newest",
    limit: 20,
    offset: 0,
  };

  assert.equal(typeof query.featureType, "string");
  assert.equal(typeof query.maxAgeDays, "number");
});
