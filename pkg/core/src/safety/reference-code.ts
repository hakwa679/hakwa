import { randomBytes } from "node:crypto";

function formatDateYYMMDD(date: Date): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function randomSuffix(length = 4): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(length);
  let output = "";
  for (let i = 0; i < length; i += 1) {
    const byte = bytes[i] ?? 0;
    output += alphabet[byte % alphabet.length];
  }
  return output;
}

export function generateSafetyReferenceCode(date = new Date()): string {
  return `SAF-${formatDateYYMMDD(date)}-${randomSuffix(4)}`;
}
