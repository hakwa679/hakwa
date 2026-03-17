const REQUIRED_SAFETY_ENV = [
  "SAFETY_CODE_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
] as const;

export function validateSafetyEnvironment(): void {
  const missing = REQUIRED_SAFETY_ENV.filter((name) => {
    const value = process.env[name];
    return !value || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `[config] Missing required safety environment variables: ${missing.join(", ")}`,
    );
  }
}
