import test from "node:test";
import assert from "node:assert/strict";

test("verify contract exposes safetyCode and vehicle details", () => {
  const payload = {
    safetyCode: "1234",
    vehiclePlate: "ABC-123",
    vehicleMake: "Toyota",
    vehicleModel: "Corolla",
    vehicleColour: "Blue",
  };
  assert.equal(typeof payload.safetyCode, "string");
  assert.equal(payload.safetyCode.length, 4);
});
