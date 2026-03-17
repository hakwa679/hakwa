import test from "node:test";
import assert from "node:assert/strict";
import { generateSafetyCode } from "./safety-code.ts";

test("safety code generation is deterministic and rotates by date", () => {
  const secret = "test-secret";
  const day1 = new Date("2026-03-17T00:00:00.000Z");
  const day2 = new Date("2026-03-18T00:00:00.000Z");
  const a = generateSafetyCode({ bookingId: "booking-1", date: day1, secret });
  const b = generateSafetyCode({ bookingId: "booking-1", date: day1, secret });
  const c = generateSafetyCode({ bookingId: "booking-1", date: day2, secret });
  assert.equal(a, b);
  assert.equal(a !== c, true);
});
