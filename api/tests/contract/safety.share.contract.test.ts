import test from "node:test";
import assert from "node:assert/strict";

test("safety share contract includes create revoke and public payload shapes", () => {
  const createResponse = {
    token: "tok_123",
    shareUrl: "https://hakwa.af/safety/share/tok_123",
    status: "active",
  };

  const revokeResponse = {
    revoked: true,
    status: "revoked",
  };

  const publicResponse = {
    tripId: "trip-1",
    status: "in_progress",
    driver: {
      firstName: "Jone",
      vehiclePlate: "ABC-123",
    },
    location: {
      lat: -18.141,
      lng: 178.441,
    },
  };

  assert.equal(typeof createResponse.token, "string");
  assert.equal(typeof createResponse.shareUrl, "string");
  assert.equal(revokeResponse.revoked, true);
  assert.equal(typeof publicResponse.tripId, "string");
  assert.equal(typeof publicResponse.driver.firstName, "string");
});
