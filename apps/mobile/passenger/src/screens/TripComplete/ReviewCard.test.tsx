import test from "node:test";
import assert from "node:assert/strict";

test("review card progression and point preview", () => {
  const points = {
    ratingOnly: 10,
    withTags: 15,
    withComment: 25,
  };

  assert.equal(points.ratingOnly, 10);
  assert.equal(points.withTags, 15);
  assert.equal(points.withComment, 25);
});
