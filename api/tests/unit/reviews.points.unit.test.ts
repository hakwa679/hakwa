import test from "node:test";
import assert from "node:assert/strict";

function calcPoints(tagCount: number, hasComment: boolean): number {
  const base = 10;
  const tagBonus = tagCount >= 2 ? 5 : 0;
  const commentBonus = hasComment ? 10 : 0;
  return base + tagBonus + commentBonus;
}

test("reviews points unit matrix", () => {
  assert.equal(calcPoints(0, false), 10);
  assert.equal(calcPoints(1, false), 10);
  assert.equal(calcPoints(2, false), 15);
  assert.equal(calcPoints(3, true), 25);
});
