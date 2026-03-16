# REST API Contracts: Notification System

_Phase 1 output for `008-notification-system`_

All endpoints are authenticated (session required). Request/response types live
in `@hakwa/types` and are imported by both `api/` and the frontend apps. Base
URL: `/api/v1`

---

## Notification Endpoints

### `GET /notifications`

Retrieve the authenticated user's notification history (in-app channel),
paginated, newest first.

**Query Parameters**:

| Param    | Type      | Required | Description                                                    |
| -------- | --------- | -------- | -------------------------------------------------------------- |
| `cursor` | `string`  | No       | Opaque cursor (encoded `createdAt + id`) for keyset pagination |
| `limit`  | `number`  | No       | Max results per page. Default: `20`. Max: `50`.                |
| `unread` | `boolean` | No       | If `true`, return only unread notifications.                   |

**Response `200 OK`**:

```json
{
  "data": [
    {
      "id": "uuid",
      "type": "driver_arrived",
      "channel": "in_app",
      "title": "Your driver has arrived",
      "body": "Ahmed is outside. Tap to view.",
      "data": { "screen": "ActiveTrip", "tripId": "uuid" },
      "status": "sent",
      "readAt": null,
      "createdAt": "2026-03-16T10:00:00Z"
    }
  ],
  "nextCursor": "string | null",
  "totalUnread": 3
}
```

**Error Responses**: `401 Unauthorized`.

---

### `GET /notifications/unread-count`

Return the current unread count for the authenticated user (in-app channel
only).

**Response `200 OK`**:

```json
{ "count": 3 }
```

**Error Responses**: `401 Unauthorized`.

---

### `PATCH /notifications/:id/read`

Mark a single notification as read. Sets `readAt = now()`.

**Path Parameters**: `id` — notification UUID.

**Response `200 OK`**:

```json
{
  "id": "uuid",
  "readAt": "2026-03-16T10:05:00Z"
}
```

**Error Responses**:

| Code  | Description                                                               |
| ----- | ------------------------------------------------------------------------- |
| `401` | Not authenticated.                                                        |
| `403` | Notification belongs to a different user.                                 |
| `404` | Notification not found.                                                   |
| `409` | Notification already marked read (idempotent — returns current `readAt`). |

> **Note**: A `409` response still includes the `readAt` timestamp so the client
> can update its local state. The frontend MUST treat `409` as a success for
> optimistic UI purposes.

---

### `POST /notifications/mark-all-read`

Mark all unread in-app notifications as read for the authenticated user.

**Response `200 OK`**:

```json
{ "markedCount": 5 }
```

**Error Responses**: `401 Unauthorized`.

---

## Device Endpoints

### `POST /devices`

Register or refresh a push token for the authenticated user.

If the token already exists in the `device` table (for this or another user),
the row's `userId` and `active` are updated — a token can migrate between users
(e.g., shared device, re-used handset).

**Request Body**:

```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "ios"
}
```

| Field       | Type     | Required | Validation                                |
| ----------- | -------- | -------- | ----------------------------------------- |
| `pushToken` | `string` | Yes      | Must match `ExponentPushToken[…]` pattern |
| `platform`  | `string` | Yes      | `ios` or `android`                        |

**Response `201 Created`**:

```json
{
  "id": "uuid",
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "ios",
  "active": true
}
```

**Error Responses**:

| Code  | Description                |
| ----- | -------------------------- |
| `400` | Missing or invalid fields. |
| `401` | Not authenticated.         |

---

### `DELETE /devices/:id`

Deactivate a push token (user logs out or revokes push permission).

**Path Parameters**: `id` — device UUID.

**Response `204 No Content`**.

**Error Responses**:

| Code  | Description                         |
| ----- | ----------------------------------- |
| `401` | Not authenticated.                  |
| `403` | Device belongs to a different user. |
| `404` | Device not found.                   |

---

## Notification Preference Endpoints

### `GET /notification-preferences`

Return the full preference matrix for the authenticated user: all 16 type × 4
channel combinations.

**Response `200 OK`**:

```json
{
  "preferences": [
    {
      "type": "driver_arrived",
      "channel": "push",
      "enabled": true,
      "locked": false
    },
    {
      "type": "system_alert",
      "channel": "push",
      "enabled": true,
      "locked": true
    }
  ]
}
```

The `locked: true` flag is set for all `system_alert` entries — these MUST be
displayed as non-interactive in the preferences UI (FR-005).

**Error Responses**: `401 Unauthorized`.

---

### `PUT /notification-preferences`

Batch-update preferences. Only non-locked preferences may be modified.

**Request Body**:

```json
{
  "preferences": [
    { "type": "wallet_credited", "channel": "email", "enabled": false },
    { "type": "badge_earned", "channel": "push", "enabled": true }
  ]
}
```

| Field                   | Type      | Required | Validation                          |
| ----------------------- | --------- | -------- | ----------------------------------- |
| `preferences`           | `array`   | Yes      | 1–64 items.                         |
| `preferences[].type`    | `string`  | Yes      | Must be a valid `NotificationType`. |
| `preferences[].channel` | `string`  | Yes      | `push \| in_app \| email \| sms`.   |
| `preferences[].enabled` | `boolean` | Yes      | `true` or `false`.                  |

**Business rule**: Any update to `system_alert` preference is silently ignored
(the server does not return an error — the client simply cannot change it).

**Response `200 OK`**:

```json
{ "updatedCount": 2 }
```

**Error Responses**:

| Code  | Description                                    |
| ----- | ---------------------------------------------- |
| `400` | Malformed request or unknown `type`/`channel`. |
| `401` | Not authenticated.                             |

---

## Error Envelope

All error responses follow the `@hakwa/errors` envelope:

```json
{
  "error": {
    "code": "NOTIFICATION_NOT_FOUND",
    "message": "Notification not found or does not belong to this user."
  }
}
```

Relevant `AppError` codes for this feature:

| Code                          | HTTP Status | When                                          |
| ----------------------------- | ----------- | --------------------------------------------- |
| `NOTIFICATION_NOT_FOUND`      | 404         | Notification ID doesn't exist or wrong user   |
| `NOTIFICATION_ALREADY_READ`   | 409         | `PATCH /read` on already-read notification    |
| `DEVICE_NOT_FOUND`            | 404         | Device ID doesn't exist or wrong user         |
| `INVALID_PUSH_TOKEN`          | 400         | Token doesn't match Expo format               |
| `PREFERENCE_UPDATE_FORBIDDEN` | 403         | Attempt to disable `system_alert` (defensive) |
