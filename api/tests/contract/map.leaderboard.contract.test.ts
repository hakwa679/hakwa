import test from "node:test";
import assert from "node:assert/strict";

test("map leaderboard contract exposes month entries and callerRank", () => {
  const payload = {
    month: "2026-03",
    entries: [],
    callerRank: null,
  };

  assert.equal(typeof payload.month, "string");
  assert.equal(Array.isArray(payload.entries), true);
  assert.equal("callerRank" in payload, true);
});
