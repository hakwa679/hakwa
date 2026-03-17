const E164_MIN_LENGTH = 8;
const E164_MAX_LENGTH = 15;

function toDigits(input: string): string {
  return input.replace(/\D/g, "");
}

export function normalizePhoneToE164(
  rawPhone: string,
  defaultCountryCode = "+679",
): string {
  const trimmed = rawPhone.trim();
  if (!trimmed) {
    throw new Error("Phone number is required");
  }

  let normalized = "";
  if (trimmed.startsWith("+")) {
    normalized = `+${toDigits(trimmed)}`;
  } else {
    const digits = toDigits(trimmed);
    if (digits.startsWith("0")) {
      normalized = `${defaultCountryCode}${digits.slice(1)}`;
    } else if (digits.startsWith(defaultCountryCode.replace("+", ""))) {
      normalized = `+${digits}`;
    } else {
      normalized = `${defaultCountryCode}${digits}`;
    }
  }

  const e164BodyLength = normalized.replace("+", "").length;
  if (
    !/^\+\d+$/.test(normalized) ||
    e164BodyLength < E164_MIN_LENGTH ||
    e164BodyLength > E164_MAX_LENGTH
  ) {
    throw new Error("Invalid E.164 phone number");
  }

  return normalized;
}
