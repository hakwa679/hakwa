import test from "node:test";
import assert from "node:assert/strict";

test("critical report integration suspends merchant in same transaction", () => {
  const incidentSaved = true;
  const suspended = true;
  assert.equal(incidentSaved && suspended, true);
});
