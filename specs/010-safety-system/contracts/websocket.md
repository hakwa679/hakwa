# WebSocket Contracts: Rider & Driver Safety System

**Feature**: 010-safety-system  
**Last updated**: 2026-03-16

Safety real-time events are delivered via the existing Hakwa WebSocket channel
(spec 008, Principle V). The connection and auth handshake follow the platform's
existing pattern (`getSessionFromRequest`). All messages use the established
JSON envelope.

Two audiences receive safety WebSocket events:

1. **End users** (passengers and drivers) — receive check-in prompts and
   acknowledgement feedback on their own sessions.
2. **Safety team** (`role = "safety_admin"`) — receive a real-time queue of SOS
   events, critical incidents, and escalations across all users.

---

## Redis Pub/Sub Channel Naming

| Channel Pattern        | Purpose                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `safety:user:<userId>` | Safety events addressed to a specific user (check-ins, acknowledgements) |
| `safety:team`          | Broadcast to all connected safety-admin sessions (SOS, critical reports) |

The `<userId>` is the user's `user.id` (text PK from Better Auth). The WebSocket
server subscribes to `safety:user:<userId>` when that user's session connects,
and to `safety:team` for any session with `role = "safety_admin"`.

---

## Server → Client Messages (User channel)

### `safety.check_in_required`

Sent to the active session of the passenger (or driver) when the anomaly
detector creates a `safetyCheckIn` row. The client renders the check-in overlay
and starts a 90-second countdown locally.

**Redis channel**: `safety:user:<userId>`

```json
{
  "type": "safety",
  "event": "check_in_required",
  "payload": {
    "checkInId": "uuid",
    "tripId": "uuid",
    "anomalyType": "route_deviation",
    "message": "Unusual route detected. Are you OK?",
    "expiresAt": "2026-03-16T10:03:30Z"
  }
}
```

**Client behaviour on receipt**:

1. Render full-screen check-in overlay above the active trip screen.
2. Show a prominent _"I'm OK"_ button and a _"Cancel alert"_ link.
3. Start a local 90-second countdown matching `expiresAt`.
4. On tap of _"I'm OK"_: call `POST /safety/check-ins/:checkInId/respond` with
   `{ "response": "ok" }` and dismiss the overlay.
5. On tap of _"Cancel alert"_: call the same endpoint with
   `{ "response": "cancel" }`.
6. If the countdown reaches zero before the user responds: show a brief
   _"Alerting your contacts…"_ toast (the server handles the actual dispatch).

---

### `safety.check_in_cancelled`

Sent to the user's session when either the trip ends before the check-in window
expires (status → `trip_ended`) or the user successfully cancelled the
escalation. Dismisses the overlay if still visible.

**Redis channel**: `safety:user:<userId>`

```json
{
  "type": "safety",
  "event": "check_in_cancelled",
  "payload": {
    "checkInId": "uuid",
    "reason": "trip_ended"
  }
}
```

> `reason` values: `"user_cancelled"`, `"trip_ended"`.

**Client behaviour on receipt**: Dismiss check-in overlay silently.

---

### `safety.sos_acknowledged`

Sent to the SOS reporter's session when a safety-admin acknowledges their active
incident. Provides reassurance that a real person is watching.

**Redis channel**: `safety:user:<userId>`

```json
{
  "type": "safety",
  "event": "sos_acknowledged",
  "payload": {
    "incidentId": "uuid",
    "referenceCode": "SAF-260316-A7X2",
    "message": "A safety agent has been alerted and is monitoring your trip."
  }
}
```

**Client behaviour on receipt**:

1. Update SOS card status indicator to _"Acknowledged"_.
2. Display the message as an overlay banner (non-dismissible until trip ends).

---

## Server → Client Messages (Safety team channel)

### `safety.sos_triggered`

Pushed to **all connected safety-admin sessions** whenever a new SOS fires.
Safety team members see this as a new item in their real-time incident queue.

**Redis channel**: `safety:team`

```json
{
  "type": "safety",
  "event": "sos_triggered",
  "payload": {
    "incidentId": "uuid",
    "referenceCode": "SAF-260316-A7X2",
    "reporterRole": "passenger",
    "tripId": "uuid",
    "reporter": {
      "userId": "text-id",
      "firstName": "Sara",
      "phone": "+6799000111"
    },
    "subject": {
      "userId": "text-id",
      "firstName": "Ahmed",
      "vehiclePlate": "FJ 1234"
    },
    "locationSnapshot": {
      "type": "Point",
      "coordinates": [178.4415, -18.1416]
    },
    "googleMapsUrl": "https://maps.google.com/?q=-18.1416,178.4415",
    "silent": false,
    "firedAt": "2026-03-16T10:01:00Z"
  }
}
```

**Safety team client behaviour**:

1. Add incident to the real-time incident queue with an audible alert.
2. Display location on an internal map.
3. Show "Acknowledge" button — calls `POST /safety/sos/:incidentId/acknowledge`.

---

### `safety.critical_incident`

Pushed to the safety team channel when a formal incident report of category
`assault` or `wrong_vehicle` is submitted (FR-018). The driver has already been
suspended by the time this event fires.

**Redis channel**: `safety:team`

```json
{
  "type": "safety",
  "event": "critical_incident",
  "payload": {
    "incidentId": "uuid",
    "referenceCode": "SAF-260316-C5Z1",
    "category": "assault",
    "tripId": "uuid",
    "reporterRole": "passenger",
    "driverSuspended": true,
    "submittedAt": "2026-03-16T10:05:00Z"
  }
}
```

---

### `safety.check_in_escalated`

Pushed to the safety team when a check-in 90-second window expires without a
user response. The SMS to contacts has been queued and a `safetyIncident` row
created.

**Redis channel**: `safety:team`

```json
{
  "type": "safety",
  "event": "check_in_escalated",
  "payload": {
    "incidentId": "uuid",
    "checkInId": "uuid",
    "referenceCode": "SAF-260316-D8W3",
    "anomalyType": "route_deviation",
    "tripId": "uuid",
    "affectedUserId": "text-id",
    "lastLocation": {
      "type": "Point",
      "coordinates": [178.4415, -18.1416]
    },
    "escalatedAt": "2026-03-16T10:04:30Z"
  }
}
```

---

## Client → Server Messages

The safety feature does **not** define any client-initiated WebSocket messages.
All safety actions (trigger SOS, respond to check-in, file a report, share a
trip) are performed via the REST API. WebSocket is receive-only for clients.

---

## Error Envelope

WebSocket errors follow the platform envelope:

```json
{
  "type": "error",
  "code": "SAFETY_INCIDENT_NOT_FOUND",
  "message": "Safety incident not found."
}
```
