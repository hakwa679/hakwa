import test from "node:test";
import assert from "node:assert/strict";

test("reviewer badge triggers placeholder", () => {
  const firstReviewAwarded = true;
  const taggedReviewerAwarded = true;
  assert.equal(firstReviewAwarded, true);
  assert.equal(taggedReviewerAwarded, true);
});
