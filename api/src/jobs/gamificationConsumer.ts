import { redis, redisSubscriber } from "@hakwa/redis";
import {
  processGamificationEvent,
  type GamificationEventPayload,
} from "@hakwa/workers";

const STREAM_KEY = "gamification:events";
const GROUP_NAME = "gamification-consumers";
const CONSUMER_NAME = `api-${process.pid}`;

let started = false;

function parseStreamFields(fields: string[]): Record<string, string> {
  const payload: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];
    if (!key || value === undefined) continue;
    payload[key] = value;
  }
  return payload;
}

async function ensureGroup(): Promise<void> {
  try {
    await redis.xgroup("CREATE", STREAM_KEY, GROUP_NAME, "$", "MKSTREAM");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("BUSYGROUP")) {
      throw err;
    }
  }
}

async function processEntry(
  messageId: string,
  fields: string[],
): Promise<void> {
  const event = parseStreamFields(fields);
  const payload: GamificationEventPayload = {
    type: (event["type"] ??
      "trip_completed") as GamificationEventPayload["type"],
    userId: event["userId"] ?? "",
  };

  if (event["tripId"]) payload.tripId = event["tripId"];
  if (event["referralCode"]) payload.referralCode = event["referralCode"];
  if (event["timestamp"]) payload.timestamp = event["timestamp"];

  if (!payload.userId) {
    await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
    return;
  }

  try {
    await processGamificationEvent(payload);
    await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
  } catch (err: unknown) {
    console.error("[gamificationConsumer] event processing failed", {
      messageId,
      payload,
      err,
    });
  }
}

async function consumeLoop(): Promise<void> {
  while (true) {
    const response = (await redisSubscriber.xreadgroup(
      "GROUP",
      GROUP_NAME,
      CONSUMER_NAME,
      "COUNT",
      10,
      "BLOCK",
      5000,
      "STREAMS",
      STREAM_KEY,
      ">",
    )) as Array<[string, Array<[string, string[]]>]> | null;

    if (!response) continue;

    for (const [, messages] of response) {
      for (const [messageId, fields] of messages) {
        await processEntry(messageId, fields);
      }
    }
  }
}

export async function startGamificationConsumer(): Promise<void> {
  if (started) return;
  started = true;

  await ensureGroup();
  consumeLoop().catch((err: unknown) => {
    console.error("[gamificationConsumer] loop crashed", { err });
    started = false;
  });
}
