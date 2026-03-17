export interface SmsSendRequest {
  to: string;
  body: string;
}

export interface SmsRetryMetadata {
  retryCount: number;
  maxRetries: number;
  retryable: boolean;
  reason?: string;
}

export interface SmsSendResult {
  messageSid: string;
}

export class TwilioSmsAdapter {
  private readonly accountSid: string;
  private readonly authToken: string;

  constructor(
    private readonly fromNumber: string,
    accountSid = process.env["TWILIO_ACCOUNT_SID"],
    authToken = process.env["TWILIO_AUTH_TOKEN"],
  ) {
    if (!accountSid || !authToken || !fromNumber) {
      throw new Error(
        "Twilio SMS adapter requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
      );
    }

    this.accountSid = accountSid;
    this.authToken = authToken;
  }

  async sendSms(input: SmsSendRequest): Promise<SmsSendResult> {
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      From: this.fromNumber,
      To: input.to,
      Body: input.body,
    });

    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
      "base64",
    );

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(
        `Twilio SMS request failed: ${response.status} ${payload}`,
      );
    }

    const json = (await response.json()) as { sid?: string };
    if (!json.sid) {
      throw new Error("Twilio SMS response missing sid.");
    }

    return {
      messageSid: json.sid,
    };
  }

  buildRetryMetadata(error: unknown, retryCount: number): SmsRetryMetadata {
    const maxRetries = 5;
    const reason = error instanceof Error ? error.message : "Unknown SMS error";

    return {
      retryCount,
      maxRetries,
      retryable: retryCount < maxRetries,
      reason,
    };
  }
}

export function createTwilioSmsAdapter(): TwilioSmsAdapter {
  const from = process.env["TWILIO_FROM_NUMBER"];
  if (!from) {
    throw new Error("TWILIO_FROM_NUMBER environment variable is required.");
  }

  return new TwilioSmsAdapter(from);
}
