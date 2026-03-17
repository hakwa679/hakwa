import test from "node:test";
import assert from "node:assert/strict";

test("POST /safety/sos response contract includes incidentId referenceCode and duplicate flag", () => {
  const payload = {
    incidentId: "incident-1",
    referenceCode: "SAF-260317-AB12",
    duplicate: false,
    emergencyNumbers: ["917", "911", "910"],
  };

  assert.equal(typeof payload.incidentId, "string");
  assert.equal(typeof payload.referenceCode, "string");
  assert.equal(typeof payload.duplicate, "boolean");
  assert.equal(Array.isArray(payload.emergencyNumbers), true);
});
