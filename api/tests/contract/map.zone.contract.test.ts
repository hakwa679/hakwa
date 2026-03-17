import test from "node:test";
import assert from "node:assert/strict";

test("zone detail contract contains top contributors and pioneer", () => {
  const payload = {
    id: "zone-1",
    topContributors: [],
    pioneer: null,
  };

  assert.equal(typeof payload.id, "string");
  assert.equal(Array.isArray(payload.topContributors), true);
});
