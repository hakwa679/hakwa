import test from "node:test";
import assert from "node:assert/strict";

// T019: US1 contract placeholder for POST /api/v1/map/features.
test("map submit contract accepts valid payload shape", () => {
  const payload = {
    featureType: "poi",
    lat: -18.124512,
    lng: 178.450123,
    geometryJson: JSON.stringify({
      type: "Point",
      coordinates: [178.450123, -18.124512],
    }),
  };

  assert.equal(typeof payload.featureType, "string");
  assert.equal(typeof payload.geometryJson, "string");
});
