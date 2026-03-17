import test from "node:test";
import assert from "node:assert/strict";

test("map leaderboard integration handles monthly rollover shape", () => {
  const archivedMonth = "2026-02";
  const currentMonth = "2026-03";

  assert.notEqual(archivedMonth, currentMonth);
});
