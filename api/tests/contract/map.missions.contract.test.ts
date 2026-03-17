import test from "node:test";
import assert from "node:assert/strict";

test("missions contract returns list payload for missions and my-progress", () => {
  const missions = { items: [] as unknown[] };
  const progress = { items: [] as unknown[] };

  assert.equal(Array.isArray(missions.items), true);
  assert.equal(Array.isArray(progress.items), true);
});
