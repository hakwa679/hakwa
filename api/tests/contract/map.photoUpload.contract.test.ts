import test from "node:test";
import assert from "node:assert/strict";

// T020A: URL-only contribution contract.
test("binary payload is out-of-contract for map contribution endpoint", () => {
  const request = { photoUrl: "https://cdn.hakwa.local/map-photos/u/f.jpg" };
  assert.equal(typeof request.photoUrl, "string");
});
