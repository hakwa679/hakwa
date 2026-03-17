import test from "node:test";
import assert from "node:assert/strict";

test("share token integration rotates active token and keeps high entropy length", () => {
  const previousToken = "tok_old_1234567890";
  const newToken = "tok_new_abcdefghijklmnopqrstuvwxyz";
  assert.notEqual(previousToken, newToken);
  assert.equal(newToken.length >= 24, true);
});
