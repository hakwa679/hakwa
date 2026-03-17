# Quickstart: Notification System

_Phase 1 output for `008-notification-system`_

This guide covers how to wire up the notification system end-to-end in
development, from schema to push delivery.

---

## Prerequisites

1. PostgreSQL running and `DATABASE_URL` set in `.env`.
2. Redis running and `REDIS_URL` set in `.env`.
3. Workspace packages installed (`npm install` from repo root).
4. Expo push credentials available (dev: use Expo Go; prod: configure EAS
   credentials).

---

## Step 1 — Add Schema Tables

Define the three new tables in `pkg/db/schema/notification.ts` and export them
from `pkg/db/schema/index.ts`:

```ts
// pkg/db/schema/index.ts
export * from "./notification.ts"; // add this line
```

Run `db-push` to apply the schema:

```bash
npm run db-push
```

Verify the three tables exist: `notification`, `device`,
`notification_preference`.

---

## Step 2 — Create the `@hakwa/notifications` Package

Create `pkg/notifications/package.json`:

```json
{
  "name": "@hakwa/notifications",
  "version": "0.0.1",
  "type": "module",
  "exports": { ".": "./index.ts" },
  "dependencies": {
    "@hakwa/db": "*",
    "@hakwa/redis": "*",
    "@hakwa/email": "*",
    "@hakwa/errors": "*",
    "expo-server-sdk": "latest"
  }
}
```

The `index.ts` exports:

```ts
export { dispatchNotification } from "./src/dispatch.js";
export { triggerNotification } from "./src/dispatch.js";
export { NotificationType, NotificationChannel } from "./src/types.js";
export type { NotificationPayload, NotificationData } from "./src/types.js";
```

---

## Step 3 — Register Push Tokens (Mobile App)

In each mobile app's root layout, on app launch:

```ts
import * as Notifications from "expo-notifications";
import { useApiClient } from "@hakwa/api-client";

async function registerPushToken() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return;
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await apiClient.post("/devices", {
    pushToken: token,
    platform: Platform.OS, // "ios" | "android"
  });
}
```

The API stores the token in `device` table. On refresh, `POST /devices` upserts
the record.

---

## Step 4 — Trigger a Notification (from an API service)

After a trip status change, the trip service calls:

```ts
import { triggerNotification } from "@hakwa/notifications";
import { NotificationType } from "@hakwa/notifications";

await triggerNotification({
  userId: trip.passengerId,
  type: NotificationType.DRIVER_ARRIVED,
  data: { screen: "ActiveTrip", tripId: trip.id },
  eventReferenceId: `driver-arrived:${trip.id}`,
});
```

`triggerNotification()` internally:

1. Inserts `notification` rows for each enabled channel (`push` + `in_app` for
   time-sensitive events).
2. Publishes each `notificationId` to the `notification:dispatch` Redis Stream.
3. Returns immediately — does **not** await delivery.

---

## Step 5 — Start the Notification Worker

The notification delivery worker runs inside the `@hakwa/workers` pool. Register
the task in `api/src/workers/notification-worker.ts`:

```ts
import { getRedisClient } from "@hakwa/redis";
import { dispatchNotification } from "@hakwa/notifications";
import { db } from "@hakwa/db";

// Called by the worker pool on task dispatch
export async function runNotificationWorker() {
  const redis = getRedisClient();
  // XREADGROUP loop — consume notification:dispatch stream
  // For each message: load notification from DB, call dispatchNotification()
  // ACK on success; update retryCount on failure; mark failed after MAX_RETRY_COUNT
}
```

In development, the API process starts the worker thread automatically on boot.
Monitor the stream with:

```bash
redis-cli XLEN notification:dispatch
redis-cli XPENDING notification:dispatch notification-workers - + 10
```

---

## Step 6 — Receive In-App Notifications (Frontend)

The TanStack Query hook in `@hakwa/api-client` polls unread count and listens on
the WebSocket:

```ts
import { useUnreadCount, useNotifications } from "@hakwa/api-client";

// In navigation bar component:
const { data } = useUnreadCount();
// Renders badge: data?.count > 99 ? "99+" : data?.count

// In NotificationCentreScreen:
const { data, fetchNextPage } = useNotifications({ unread: false });
```

The WebSocket hook in `@hakwa/api-client` automatically increments the unread
count when a `{ type: "notification", event: "new" }` message arrives.

---

## Step 7 — Manage Preferences (Frontend)

```ts
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "@hakwa/api-client";

const { data: prefs } = useNotificationPreferences();
const { mutate: updatePrefs } = useUpdateNotificationPreferences();

// Toggle email for wallet_credited:
updatePrefs([{ type: "wallet_credited", channel: "email", enabled: false }]);
```

`system_alert` rows are returned with `locked: true` from the API; the
preferences screen renders them as non-interactive (`opacity: 0.5`, toggle
disabled).

---

## Step 8 — Daily Re-Engagement Job

Register the cron job in `api/src/index.ts`:

```ts
import { scheduleInactivityReminder } from "./services/inactivity-job.js";

scheduleInactivityReminder(); // runs daily at 09:00 local time
```

Test manually:

```bash
curl -X POST http://localhost:3000/internal/jobs/inactivity-reminder \
  -H "x-internal-key: $INTERNAL_JOB_KEY"
```

---

## Environment Variables

| Variable           | Required   | Description                                 |
| ------------------ | ---------- | ------------------------------------------- |
| `DATABASE_URL`     | Yes        | PostgreSQL connection string                |
| `REDIS_URL`        | Yes        | Redis connection string                     |
| `SMS_PROVIDER`     | No         | SMS gateway name (e.g., `twilio`, `vonage`) |
| `SMS_API_KEY`      | No         | API key for SMS provider                    |
| `SMS_FROM_NUMBER`  | No         | Sender number for outbound SMS              |
| `INTERNAL_JOB_KEY` | Yes (prod) | Secret for internal job trigger endpoints   |

Email variables are managed by `@hakwa/email` (already configured).

Push credentials are managed by Expo — no server-side variables needed for EPN
in development (Expo Go handles it). In production, EAS configures credentials
automatically.

---

## Testing the Pipeline

```bash
# 1. Insert a test notification directly
curl -X POST http://localhost:3000/api/v1/internal/test-notification \
  -H "Authorization: Bearer <token>" \
  -d '{"type":"system_alert","title":"Test","body":"Hello"}'

# 2. Check notification appears in API response
curl http://localhost:3000/api/v1/notifications \
  -H "Authorization: Bearer <token>"

# 3. Mark it as read
curl -X PATCH http://localhost:3000/api/v1/notifications/<id>/read \
  -H "Authorization: Bearer <token>"

# 4. Verify unread count decremented
curl http://localhost:3000/api/v1/notifications/unread-count \
  -H "Authorization: Bearer <token>"
```
