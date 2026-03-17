import db from "@hakwa/db";
import { safetyIncident } from "@hakwa/db/schema";
import { createTwilioSmsAdapter } from "@hakwa/notifications";
import { redis } from "@hakwa/redis";
import { eq } from "drizzle-orm";

const SMS_OUTBOX_STREAM = "safety:sms:outbox";
const POLL_INTERVAL_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEntry(fields: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];
    if (!key || value === undefined) {
      continue;
    }
    parsed[key] = value;
  }
  return parsed;
}

export function startSafetySmsSender(): void {
  const smsAdapter = createTwilioSmsAdapter();
  let running = true;
  let lastId = "0-0";

  const loop = async (): Promise<void> => {
    while (running) {
      try {
        const entries = (await redis.xread(
          "COUNT",
          20,
          "STREAMS",
          SMS_OUTBOX_STREAM,
          lastId,
        )) as Array<[string, Array<[string, string[]]>]> | null;

        if (!entries) {
          await sleep(POLL_INTERVAL_MS);
          continue;
        }

        const streamEntries = entries[0]?.[1] ?? [];
        for (const [entryId, rawFields] of streamEntries) {
          if (!entryId || !rawFields) {
            continue;
          }

          lastId = entryId;
          const fields = parseEntry(rawFields);
          const to = fields["to"];
          const body = fields["body"];
          const incidentId = fields["incidentId"];
          const retryCount = Number(fields["retryCount"] ?? "0");

          if (!to || !body) {
            continue;
          }

          try {
            await smsAdapter.sendSms({ to, body });

            if (incidentId) {
              await db
                .update(safetyIncident)
                .set({ smsDispatchedAt: new Date(), smsFailed: false })
                .where(eq(safetyIncident.id, incidentId));
            }
          } catch (error) {
            const retry = smsAdapter.buildRetryMetadata(error, retryCount + 1);

            if (retry.retryable) {
              await redis.xadd(
                SMS_OUTBOX_STREAM,
                "*",
                "to",
                to,
                "body",
                body,
                "incidentId",
                incidentId ?? "",
                "retryCount",
                String(retry.retryCount),
                "error",
                retry.reason ?? "SMS_SEND_FAILED",
              );
              continue;
            }

            if (incidentId) {
              await db
                .update(safetyIncident)
                .set({ smsFailed: true })
                .where(eq(safetyIncident.id, incidentId));
            }
          }
        }
      } catch (error) {
        console.error("[safety:smsSender] worker loop failed", { error });
        await sleep(POLL_INTERVAL_MS);
      }
    }
  };

  loop().catch((error) => {
    console.error("[safety:smsSender] worker crashed", { error });
  });

  const shutdown = () => {
    running = false;
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
