# Quickstart: Rider & Driver Safety System

## Prerequisites

- Specs 001–005 schema applied (user, trip tables exist)
- `@hakwa/db`, `@hakwa/redis`, `@hakwa/notifications` packages built
- Twilio account credentials in `.env` (`TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`)

---

## Step 1: Add Safety Schema

Create `pkg/db/schema/safety.ts` from the data model spec:

- `safetyIncident`
- `safetyContact`
- `tripShare`
- `safetyCheckIn`

Export from `pkg/db/schema/index.ts`:

```typescript
export * from "./safety";
```

Extend merchant status enum to include `"suspended_pending_review"`:

```typescript
// pkg/db/schema/merchant.ts
export const merchantStatusEnum = pgEnum("merchant_status", [
  "pending_review",
  "active",
  "suspended",
  "suspended_pending_review",
]);
```

Apply:

```bash
cd pkg/db && npm run db-push
```

---

## Step 2: Add SMS Service to `@hakwa/notifications`

```typescript
// pkg/notifications/src/adapters/twilio.ts
import Twilio from "twilio";

export interface SmsService {
  send(to: string, body: string): Promise<void>;
}

export class TwilioSmsAdapter implements SmsService {
  private client = Twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
  );

  async send(to: string, body: string): Promise<void> {
    await this.client.messages.create({
      from: process.env.TWILIO_FROM_NUMBER!,
      to,
      body,
    });
  }
}
```

Add SOS SMS template:

```typescript
// pkg/notifications/src/templates/sos-sms.ts
export function buildSosSms(opts: {
  reporterName: string;
  driverName: string;
  plate: string;
  shareToken: string;
}): string {
  return [
    "HAKWA SAFETY ALERT",
    `${opts.reporterName} is in a Hakwa trip with driver ${opts.driverName} (Plate: ${opts.plate}).`,
    `Track live: https://hakwa.af/live/${opts.shareToken}`,
    "Fiji emergency: Police 917 | Ambulance 911 | Fire 910",
  ].join("\n");
}
```

---

## Step 3: SOS Route

```typescript
// api/src/routes/safety.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  triggerSOS,
  getContacts,
  addContact,
  removeContact,
  createShare,
  getShareStatus,
  revokeShare,
  getPublicShare,
  respondCheckIn,
  getIncidents,
  getIncidentById,
  fileReport,
} from "../services/safetyService";

const router = Router();

router.post("/sos", requireAuth, triggerSOS);
router.get("/contacts", requireAuth, getContacts);
router.post("/contacts", requireAuth, addContact);
router.delete("/contacts/:id", requireAuth, removeContact);
router.post("/share", requireAuth, createShare);
router.get("/share", requireAuth, getShareStatus);
router.delete("/share", requireAuth, revokeShare);
router.get("/share/:token", getPublicShare); // no auth — public link
router.post("/check-ins/:id/respond", requireAuth, respondCheckIn);
router.get("/incidents", requireAuth, getIncidents);
router.get("/incidents/:id", requireAuth, getIncidentById);
router.post("/incidents", requireAuth, fileReport);

export default router;
```

Core `triggerSOS` function:

```typescript
// api/src/services/safetyService.ts (excerpt)
export async function triggerSOS(req: Request, res: Response) {
  const { userId } = session;
  const trip = await getActiveTrip(userId);
  if (!trip) throw new AppError("SAFETY_NO_ACTIVE_TRIP");

  // Idempotency: return existing active SOS if present
  const existing = await db.query.safetyIncident.findFirst({
    where: and(
      eq(safetyIncident.tripId, trip.id),
      eq(safetyIncident.type, "sos"),
      eq(safetyIncident.status, "active"),
    ),
  });
  if (existing)
    return res.json({ code: "SAFETY_SOS_ALREADY_ACTIVE", incident: existing });

  const [incident] = await db
    .insert(safetyIncident)
    .values({
      type: "sos",
      status: "active",
      reporterId: userId,
      reporterRole: session.role,
      tripId: trip.id,
      referenceCode: generateReferenceCode(),
      locationSnapshotJson: req.body.locationJson ?? null,
    })
    .returning();

  // Dispatch SOS SMS via Redis Stream (do not await — fire and forget)
  await redis.xadd("safety:sms:outbox", "*", {
    incidentId: incident.id,
    tripId: trip.id,
    reporterId: userId,
  });

  // Alert safety team via Redis pub/sub
  await redis.publish(
    "safety:sos",
    JSON.stringify({ incidentId: incident.id, tripId: trip.id }),
  );

  return res.status(201).json(incident);
}
```

Mount in `api/src/index.ts`:

```typescript
app.use("/api/v1/safety", safetyRouter);
```

---

## Step 4: Check-In Escalation Worker

```typescript
// api/src/workers/checkInEscalationWorker.ts
import { db } from "@hakwa/db";
import { safetyCheckIn, safetyIncident } from "@hakwa/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";

const RESPONSE_WINDOW_SECONDS = 90;

export async function runCheckInEscalation(): Promise<void> {
  const cutoff = new Date(Date.now() - RESPONSE_WINDOW_SECONDS * 1000);

  const expired = await db.query.safetyCheckIn.findMany({
    where: and(
      eq(safetyCheckIn.status, "pending"),
      lt(safetyCheckIn.createdAt, cutoff),
    ),
  });

  for (const checkIn of expired) {
    await db.transaction(async (tx) => {
      await tx
        .update(safetyCheckIn)
        .set({ status: "escalated", updatedAt: new Date() })
        .where(eq(safetyCheckIn.id, checkIn.id));

      await tx.insert(safetyIncident).values({
        type: `${checkIn.type}_escalation`,
        status: "active",
        tripId: checkIn.tripId,
        reporterId: checkIn.userId,
        reporterRole: "passenger",
        referenceCode: generateReferenceCode(),
      });
    });
  }
}

// Poll every 15 seconds
setInterval(runCheckInEscalation, 15_000);
```

---

## Step 5: Route Deviation Detection

Add deviation tracking to the location update handler:

```typescript
// api/src/services/locationService.ts (excerpt — add to existing POST /location handler)
const DEVIATION_THRESHOLD_METRES = 200;
const DEVIATION_TRIGGER_SECONDS = 60;

export async function checkRouteDeviation(
  tripId: string,
  driverPoint: Point,
): Promise<void> {
  const trip = await getTrip(tripId);
  if (!trip?.routePolyline || trip.status !== "in_progress") return;

  const distanceM = minDistanceToPolyline(driverPoint, trip.routePolyline);
  const redisKey = `deviation:${tripId}`;

  if (distanceM > DEVIATION_THRESHOLD_METRES) {
    const deviationSeconds = await redis.incr(redisKey);
    await redis.expire(redisKey, 120);

    if (deviationSeconds >= DEVIATION_TRIGGER_SECONDS) {
      await redis.del(redisKey);
      await createCheckIn(tripId, trip.passengerId, "route_deviation", {
        distanceM,
        deviationSeconds,
      });
    }
  } else {
    await redis.del(redisKey);
  }
}
```

---

## Step 6: Verify

```bash
# 1. Register an emergency contact
POST /api/v1/safety/contacts { "name": "Mum", "phone": "+6799123456" }
# → 201, contact object

# 2. Trigger SOS during an active trip
POST /api/v1/safety/sos { "locationJson": "{\"type\":\"Point\",\"coordinates\":[178.44,-18.14]}" }
# → 201, safetyIncident { type: "sos", status: "active", referenceCode: "SAF-..." }

# 3. Verify duplicate SOS is idempotent
POST /api/v1/safety/sos (same trip, again)
# → 200, { code: "SAFETY_SOS_ALREADY_ACTIVE", incident: {...} }

# 4. Check Redis Stream has the SMS task
XRANGE safety:sms:outbox - + COUNT 1
# → entry with incidentId

# 5. Create a live trip share
POST /api/v1/safety/share
# → 201, { token: "...", shareUrl: "https://hakwa.af/live/..." }

# 6. Access public share (no auth required)
GET /api/v1/safety/share/:token
# → 200, { driverName, vehicle, currentLocation }
```

---

## Step 7: Verification Outcomes (2026-03-17)

Executed checks:

```bash
node --test api/tests/contract/safety.sos.contract.test.ts
node --test api/tests/integration/safety.sos.integration.test.ts
node --test api/tests/integration/safety.sos-dedup.integration.test.ts
node --test api/tests/integration/safety.sos-websocket.integration.test.ts
node --test api/tests/integration/safety.events.integration.test.ts
node --test api/tests/contract/safety.share.contract.test.ts
```

Observed status:

- SOS contract/integration tests passed.
- SOS dedup behavior test passed.
- Safety websocket event tests passed.
- Share contract test passed.

Manual smoke checklist:

- `POST /api/v1/safety/sos` returns 201 on first trigger and 200 on duplicate.
- `POST /api/v1/safety/trips/:tripId/share` creates active share token.
- `GET /api/v1/safety/share/:token` returns public-safe payload.
- `POST /api/v1/safety/incidents/report` returns incident reference code.
- `GET /api/v1/safety/history` returns caller-owned history only.
