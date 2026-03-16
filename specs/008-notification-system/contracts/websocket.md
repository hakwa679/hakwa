# WebSocket Contracts: Notification System

_Phase 1 output for `008-notification-system`_

In-app notifications are delivered via the existing Hakwa WebSocket channel
(Principle V). The connection and auth handshake follow the platform's existing
pattern (`getSessionFromRequest`). All messages use the established JSON
envelope.

---

## Server → Client Messages

### `notification.new`

Pushed to connected clients when a new `in_app` notification is created for that
user. Published via `notification:inapp:<userId>` Redis pub/sub channel; the
WebSocket server fan-out delivers it to all sessions for that user.

```json
{
  "type": "notification",
  "event": "new",
  "payload": {
    "id": "uuid",
    "type": "driver_arrived",
    "channel": "in_app",
    "title": "Your driver has arrived",
    "body": "Ahmed is outside. Tap to view.",
    "data": {
      "screen": "ActiveTrip",
      "tripId": "uuid"
    },
    "status": "sent",
    "readAt": null,
    "createdAt": "2026-03-16T10:00:00Z"
  }
}
```

**Client behaviour on receipt**:

1. Prepend notification to the notification centre list.
2. Increment unread count badge by 1 (optimistic — no API call needed).
3. If the notification contains a `data.screen` field, make it tappable for
   deep-link navigation.
4. Invalidate `useUnreadCount` TanStack Query key so the next focus refresh
   re-syncs with the server.

---

### `notification.read`

Pushed to all other sessions of the same user when a notification is marked read
from one session (e.g., user taps notification on phone; web shows it as read).

```json
{
  "type": "notification",
  "event": "read",
  "payload": {
    "id": "uuid",
    "readAt": "2026-03-16T10:05:00Z"
  }
}
```

**Client behaviour on receipt**: Update notification in local list to `readAt`
value; decrement unread count if previously unread.

---

## Client → Server Messages

The notification feature does **not** define any client-initiated WebSocket
messages. All notification actions (mark-as-read, fetch list, manage
preferences) are performed via the REST API.

---

## Error Envelope

WebSocket errors follow the platform envelope (Principle XI):

```json
{
  "type": "error",
  "code": "NOTIFICATION_NOT_FOUND",
  "message": "Notification not found."
}
```

---

## Redis Pub/Sub Channel Naming

| Channel Pattern               | Purpose                                         |
| ----------------------------- | ----------------------------------------------- |
| `notification:inapp:<userId>` | Fan-out in-app notifications to a specific user |

The `<userId>` is the user's `user.id` (text PK from Better Auth). The WebSocket
server subscribes to this channel when a user's session is established and
unsubscribes when the session closes.
