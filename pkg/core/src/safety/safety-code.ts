import { createHmac } from "node:crypto";

function isoDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function generateSafetyCode(input: {
  bookingId: string;
  date?: Date;
  secret?: string;
}): string {
  const secret = input.secret ?? process.env["SAFETY_CODE_SECRET"];
  if (!secret) {
    throw new Error("SAFETY_CODE_SECRET is required");
  }

  const payload = `${input.bookingId}${isoDate(input.date)}`;
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  const value = parseInt(digest.slice(0, 8), 16) % 10000;
  return String(value).padStart(4, "0");
}
