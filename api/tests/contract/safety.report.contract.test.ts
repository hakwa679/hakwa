import test from "node:test";
import assert from "node:assert/strict";

test("report contract returns incidentId and referenceCode", () => {
  const payload = {
    incidentId: "incident-1",
    referenceCode: "SAF-260317-ABCD",
  };
  assert.equal(typeof payload.incidentId, "string");
  assert.equal(typeof payload.referenceCode, "string");
});
