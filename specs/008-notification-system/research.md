# Research: Notification System

_Phase 0 output for `008-notification-system`_

---

## 1. Push Notification Delivery — Expo EPN (expo-server-sdk)

**Decision**: Use `expo-server-sdk` for all push notification delivery from the
server.

**Rationale**:

- All three mobile apps (Rider, Driver, Merchant) are React Native Expo managed
  workflow. Expo Push Notification Service (EPN) is the natural server-side
  counterpart — no separate APNs/FCM credential management required per app.
- The SDK batches up to 100 push messages per request, reducing API call volume.
- EPN returns per-token `DeviceNotRegisteredError` and `InvalidCredentialsError`
  receipts, enabling immediate token deactivation without a polling loop.

**Token lifecycle**:

1. App calls `Notifications.getExpoPushTokenAsync()` on launch and
   token-refresh.
2. App POSTs the token to `POST /devices` (API).
3. Server stores token in `device` table (`userId`, `pushToken`, `platform`,
   `active: true`).
4. On EPN response: if receipt status is `error` with type
   `DeviceNotRegistered`, server issues
   `UPDATE device SET active = false WHERE pushToken = $token` immediately
   (FR-007).
5. Server never retries a token marked `active = false`.

**Payload structure** (per FR-006):

```json
{
  "to": "<ExponToken>",
  "title": "Your driver has arrived",
  "body": "Ahmed is outside. Tap to view.",
  "data": { "screen": "ActiveTrip", "tripId": "uuid" },
  "sound": "default",
  "badge": 3
}
```

The `data` field carries enough context for the app to deep-link without an
additional API call.

**Alternatives considered**:

- _Direct APNs + FCM_: Requires managing certificates/keys per platform; adds
  significant ops overhead. Rejected — Expo handles credential rotation.
- _Firebase Cloud Messaging (FCM) only_: FCM can deliver to both iOS and Android
  but requires Expo to bridge to APNs anyway in managed workflow. Rejected —
  redundant layer.

---

## 2. Redis Streams for Async Notification Dispatch

**Decision**: Use Redis Streams with a consumer group for the notification
dispatch pipeline (`notification:dispatch` stream).

**Rationale**:

- Redis Streams provide at-least-once delivery with consumer group ACK
  semantics. A worker that crashes mid-delivery leaves the message in the `PEL`
  (pending entry list) and another consumer can claim it after a configurable
  `IDLE` timeout — exactly the retry behaviour needed for FR-008.
- Stream entries carry the full `notificationId` (UUID) so the worker can load
  the record from DB, check current status, and skip already-`sent` records
  (idempotency guard).
- The existing `@hakwa/redis` package already wraps the Redis client; adding
  stream helpers there keeps all Redis access centralised (Principle VI).

**Stream topology**:

```
Stream key:    notification:dispatch
Consumer group: notification-workers
Consumers:     notification-worker-{pid} (one per worker thread)
```

**Message structure** (minimal — worker loads full record from DB):

```json
{ "notificationId": "uuid", "publishedAt": "ISO8601" }
```

**Delivery flow**:

1. `notification-service.ts` writes `notification` row (status `pending`), then
   calls `XADD notification:dispatch * notificationId <id>`.
2. Worker thread (`notification-worker.ts`) calls `XREADGROUP … NOACK` in a
   loop, processes each message, then ACKs with `XACK`.
3. On success: `UPDATE notification SET status = 'sent'`.
4. On failure: increment `retryCount`; if below `MAX_RETRY_COUNT`, re-publish to
   stream with back-off metadata; else set status `failed` with error detail.
5. Pending messages idle > 30 s are reclaimed by a monitor job using
   `XAUTOCLAIM`.

**Alternatives considered**:

- _Redis Pub/Sub_: Fire-and-forget; no persistence, no at-least-once guarantee.
  Rejected — failed notifications would be silently lost.
- _BullMQ job queue_: Viable but introduces an extra abstraction layer on top of
  Redis that the constitution does not mandate. Rejected — Redis Streams are
  already the preferred transport for internal hooks (Principle IX).
- _In-process queue_: No persistence across restarts. Rejected immediately.

---

## 3. Notification Idempotency via `eventReferenceId`

**Decision**: Add a nullable `eventReferenceId` column (type `text`) to the
`notification` table with a **partial unique index**:
`UNIQUE (userId, type, eventReferenceId) WHERE eventReferenceId IS NOT NULL`.

**Rationale**:

- Platform events (trip completion, wallet credit, badge award) may fire
  multiple times if a webhook is delivered twice or a job retries (FR-013,
  FR-015, SC-005).
- Using the triggering entity's natural ID (e.g., `tripId`, `ledgerEntryId`,
  `badgeKey`) as `eventReferenceId` makes the `INSERT` into `notification`
  idempotent: a duplicate event hits the unique constraint and is discarded via
  `ON CONFLICT DO NOTHING`.
- The partial index (only for non-null values) preserves the ability to send
  system alerts and channel-specific re-deliveries that do not have a natural
  reference ID.

**Alternatives considered**:

- _Application-level de-duplication check_: `SELECT EXISTS(…)` before `INSERT`.
  Rejected — TOCTOU race condition under concurrent load.
- _Idempotency key in request header_: Suitable for external webhooks; not
  applicable for internally triggered notifications.

---

## 4. In-App Notification Delivery via WebSocket

**Decision**: In-app notifications are delivered by publishing a
`notification:inapp:<userId>` Redis channel message from the
`@hakwa/notifications` in-app sender; the existing WebSocket server subscribes
to these channels for connected users and forwards the payload as a
`{ type: "notification", payload: NotificationRecord }` WebSocket message.

**Rationale**:

- The existing WebSocket architecture (Principle V) already uses Redis pub/sub
  for fan-out to connected clients. Reusing the same channel pattern avoids a
  second WebSocket message type or a new connection.
- Disconnected users receive no in-app delivery at the time of the event; when
  they reconnect their client fetches unread notifications via
  `GET /notifications?readAt=null`.

**Message envelope**:

```json
{
  "type": "notification",
  "payload": {
    "id": "uuid",
    "type": "driver_arrived",
    "title": "Your driver has arrived",
    "body": "Ahmed is outside.",
    "data": { "screen": "ActiveTrip", "tripId": "uuid" },
    "readAt": null,
    "createdAt": "2026-03-16T10:00:00Z"
  }
}
```

---

## 5. SMS Gateway Pattern

**Decision**: SMS sender in `@hakwa/notifications/src/senders/sms.ts` reads
provider credentials and endpoint URL exclusively from environment variables
(`SMS_PROVIDER`, `SMS_API_KEY`, `SMS_FROM_NUMBER`). The adapter calls the
provider's HTTP API. No specific provider is hardcoded.

**Rationale** (per spec Assumptions): "Email and SMS sending providers are
configured via environment variables. The spec does not prescribe which
providers are used." The adapter pattern isolates the provider choice behind an
internal interface.

**Alternatives considered**:

- _Twilio SDK baked in_: Locks to one provider. Rejected — constitution and spec
  explicitly defer provider choice.

---

## 6. `notificationPreference` Defaults

**Decision**: Default preferences for every user are **enabled for all types and
all channels**. Preference rows are created lazily: if no row exists for a
`(userId, type, channel)` tuple, the system treats it as `enabled: true`.
Explicit `INSERT` of default rows happens in the account creation hook (same job
that creates `pointsAccount`).

**Rationale**: Creating all rows on account creation
(`16 types × 4 channels = 64 rows per user`) allows the preferences screen to
render without handling "no preference" as a special case. Lazy creation would
require the UI to distinguish "not set" from "disabled", complicating the
preferences page.

**Alternatives considered**:

- _Lazy creation_: Simpler DB writes at registration, more complex query logic.
  Rejected — the added query complexity and UI edge cases outweigh the savings.

---

## 7. Re-Engagement Job Architecture

**Decision**: The daily inactivity check runs as a scheduled cron job in the API
process (`node-cron` or equivalent). It queries for passengers with
`MAX(trip.createdAt) < now - INACTIVITY_DAYS` (or no trips at all), then calls
`triggerNotification()` per user. The job is idempotent: it checks for an
existing `re_engagement` notification sent within the current inactivity window
before creating a new one (via the `eventReferenceId` pattern using today's date
string as the reference ID, e.g., `re-engagement:2026-03-16`).

**Constant**: `INACTIVITY_DAYS = 7` defined in
`@hakwa/notifications/src/types.ts`.

**Alternatives considered**:

- _Redis-scheduled job via BullMQ cron_: More infrastructure; overkill for a
  daily low-volume scan. Rejected.
- _External scheduler (cron daemon)_: Requires process management outside the
  monorepo. Rejected — in-process cron is sufficient at current scale.

---

## 8. Unread Count Query Strategy

**Decision**: Unread count is served by a dedicated endpoint
`GET /notifications/unread-count` that runs:

```sql
SELECT COUNT(*) FROM notification
WHERE user_id = $userId AND read_at IS NULL AND channel = 'in_app';
```

The frontend TanStack Query hook (`useUnreadCount`) caches this count with a
`staleTime` of 30 s and invalidates on:

- `PATCH /notifications/:id/read` mutation success.
- Incoming `{ type: "notification" }` WebSocket message (new notification
  arrives → count incremented optimistically).

**Alternatives considered**:

- _Redis counter (`INCR`/`DECR`)_: Fast but risks drift between DB and Redis if
  a mark-as-read or delete fails. Rejected — DB query at current scale is
  acceptable and always correct.
- _Return count in every `GET /notifications` response_: Adds coupling between
  pagination and the badge count. Rejected — separate endpoint decouples the
  concerns cleanly.
