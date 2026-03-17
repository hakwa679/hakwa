import test from "node:test";
import assert from "node:assert/strict";

test("reviews points integration schedule", () => {
  const cases = [
    { tags: 0, comment: false, points: 10 },
    { tags: 2, comment: false, points: 15 },
    { tags: 2, comment: true, points: 25 },
  ];

  assert.deepEqual(
    cases.map((c) => c.points),
    [10, 15, 25],
  );
});
