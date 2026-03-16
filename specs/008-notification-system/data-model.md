# Data Model: Notification System

_Phase 1 output for `008-notification-system`_

All tables defined in `pkg/db/schema/notification.ts`, exported through
`@hakwa/db`.

---

## Entities

### 1. `notification`

The canonical record for every notification. Created before dispatch; status
updated to `sent` or `failed` by the delivery worker.

| Column             | Type                           | Constraints                                | Notes                                                 |
| ------------------ | ------------------------------ | ------------------------------------------ | ----------------------------------------------------- |
| `id`               | `uuid`                         | PK, default `gen_random_uuid()`            |                                                       |
| `userId`           | `text`                         | NOT NULL, FK → `user.id` ON DELETE CASCADE |                                                       |
| `type`             | `NotificationType` (text enum) | NOT NULL                                   | Closed enum — see below                               |
| `channel`          | `NotificationChannel` (text)   | NOT NULL                                   | `push \| in_app \| email \| sms`                      |
| `title`            | `varchar(255)`                 | NOT NULL                                   | Display title                                         |
| `body`             | `text`                         | NOT NULL                                   | Human-readable body text                              |
| `data`             | `jsonb`                        | nullable                                   | Deep-link context (screen, entityId, etc.)            |
| `status`           | `NotificationStatus` (text)    | NOT NULL, default `pending`                | `pending \| sent \| failed`                           |
| `retryCount`       | `integer`                      | NOT NULL, default 0                        | Incremented on each failed attempt                    |
| `errorDetail`      | `text`                         | nullable                                   | Last error message from sender                        |
| `readAt`           | `timestamp`                    | nullable                                   | Null = unread. Set on `PATCH /notifications/:id/read` |
| `eventReferenceId` | `text`                         | nullable                                   | Idempotency key — see partial unique index below      |
| `createdAt`        | `timestamp`                    | NOT NULL, default `now()`                  |                                                       |

**Indexes**:

- `idx_notification_user_channel_read` on `(userId, channel, readAt)` — serves
  `GET /notifications?channel=in_app&readAt=null` efficiently.
- `idx_notification_user_created` on `(userId, createdAt DESC)` — serves
  paginated notification centre.
- **Partial unique index**:
  `UNIQUE (userId, type, eventReferenceId) WHERE eventReferenceId IS NOT NULL` —
  enforces idempotency for event-triggered notifications (SC-005).

**Relations**: belongs-to `user`.

---

### 2. `device`

Stores each user's Expo push token(s). A user may have multiple active devices.

| Column      | Type                    | Constraints                                | Notes                                               |
| ----------- | ----------------------- | ------------------------------------------ | --------------------------------------------------- |
| `id`        | `uuid`                  | PK, default `gen_random_uuid()`            |                                                     |
| `userId`    | `text`                  | NOT NULL, FK → `user.id` ON DELETE CASCADE |                                                     |
| `pushToken` | `varchar(512)`          | NOT NULL, UNIQUE                           | Expo push token (`ExponentPushToken[…]`)            |
| `platform`  | `DevicePlatform` (text) | NOT NULL                                   | `ios \| android`                                    |
| `active`    | `boolean`               | NOT NULL, default `true`                   | Set to `false` on `DeviceNotRegistered` EPN receipt |
| `createdAt` | `timestamp`             | NOT NULL, default `now()`                  |                                                     |
| `updatedAt` | `timestamp`             | NOT NULL, default `now()`, `$onUpdate`     |                                                     |

**Indexes**:

- `idx_device_user_active` on `(userId, active)` — serves the push sender query
  (`WHERE userId = $id AND active = true`).

**Relations**: belongs-to `user`.

---

### 3. `notificationPreference`

One row per `(userId, type, channel)` tuple. Absence of a row = default enabled.
Rows are seeded on account creation (all 16 types × 4 channels = 64 rows).

| Column      | Type                           | Constraints                                | Notes |
| ----------- | ------------------------------ | ------------------------------------------ | ----- |
| `id`        | `uuid`                         | PK, default `gen_random_uuid()`            |       |
| `userId`    | `text`                         | NOT NULL, FK → `user.id` ON DELETE CASCADE |       |
| `type`      | `NotificationType` (text enum) | NOT NULL                                   |       |
| `channel`   | `NotificationChannel` (text)   | NOT NULL                                   |       |
| `enabled`   | `boolean`                      | NOT NULL, default `true`                   |       |
| `createdAt` | `timestamp`                    | NOT NULL, default `now()`                  |       |
| `updatedAt` | `timestamp`                    | NOT NULL, default `now()`, `$onUpdate`     |       |

**Unique constraint**: `UNIQUE (userId, type, channel)`.

**Business rule**: `system_alert` type preferences are always returned as
`enabled: true` by the API regardless of the stored value — the column value for
this type MUST NOT be written to `false` by preference update endpoints
(enforced in `notification-service.ts`).

**Relations**: belongs-to `user`.

---

## Enums

### `NotificationType`

Closed enum. New types MUST be added here, never stored as free strings
(FR-002).

```
booking_confirmed
driver_accepted
driver_en_route
driver_arrived
trip_started
trip_completed
receipt_generated
wallet_credited
payout_processed
payout_failed
badge_earned
level_up
streak_milestone
referral_conversion
re_engagement
system_alert
```

### `NotificationChannel`

```
push
in_app
email
sms
```

### `NotificationStatus`

```
pending
sent
failed
```

### `DevicePlatform`

```
ios
android
```

---

## Constants

Defined in `@hakwa/notifications/src/types.ts`:

| Constant                      | Value                     | Purpose                                          |
| ----------------------------- | ------------------------- | ------------------------------------------------ |
| `INACTIVITY_DAYS`             | `7`                       | Days without a trip before re-engagement notif   |
| `MAX_RETRY_COUNT`             | `5`                       | Maximum delivery retry attempts per notification |
| `RETRY_BASE_DELAY_MS`         | `1000`                    | Initial back-off delay in milliseconds           |
| `RETRY_MAX_DELAY_MS`          | `60000`                   | Cap on exponential back-off delay                |
| `NOTIFICATION_STREAM_KEY`     | `'notification:dispatch'` | Redis Stream key                                 |
| `NOTIFICATION_CONSUMER_GROUP` | `'notification-workers'`  | Redis consumer group                             |
| `INAPP_PUBSUB_PREFIX`         | `'notification:inapp:'`   | Redis channel prefix for in-app delivery         |

---

## State Transitions

### `notification.status`

```
pending  ──(dispatch success)──►  sent
pending  ──(dispatch error, retryCount < MAX)──►  pending (re-enqueued)
pending  ──(dispatch error, retryCount ≥ MAX)──►  failed
```

The delivery worker uses a conditional update:

```sql
UPDATE notification
SET status = 'sent', error_detail = NULL
WHERE id = $id AND status = 'pending'
RETURNING *;
```

A zero-row return (status already changed) is treated as a no-op — the message
is ACKed and skipped.

### `device.active`

```
active: true  ──(EPN DeviceNotRegistered)──►  active: false
```

Once `false`, the device is never written `true` again. The mobile app
re-registers on next launch, creating a new `device` row with a fresh push
token.

---

## Relationships Diagram

```
user
 ├─ notification (1→N, via userId)
 ├─ device (1→N, via userId)
 └─ notificationPreference (1→N, via userId)
```

No relationships between `notification`, `device`, and `notificationPreference`
directly — all three anchor to `user`.
