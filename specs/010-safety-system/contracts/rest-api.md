# REST API Contracts: Rider & Driver Safety System

**Feature**: 010-safety-system  
**Last updated**: 2026-03-16

All endpoints require authentication via `getSessionFromRequest` unless
explicitly stated otherwise. Request/response types live in `@hakwa/types`.

**Base URL**: `/api/v1/safety`

---

## Error Codes

All error codes are defined in `@hakwa/errors`.

| Code                               | HTTP | Description                                                            |
| ---------------------------------- | ---- | ---------------------------------------------------------------------- |
| `SAFETY_CONTACT_LIMIT_REACHED`     | 409  | User already has 3 active emergency contacts                           |
| `SAFETY_CONTACT_NOT_FOUND`         | 404  | Emergency contact with given ID not found or not owned by caller       |
| `SAFETY_INCIDENT_NOT_FOUND`        | 404  | Safety incident not found or not owned by caller                       |
| `SAFETY_NO_ACTIVE_TRIP`            | 422  | SOS or share requires an active trip; none found for this user         |
| `SAFETY_SOS_ALREADY_ACTIVE`        | 200  | An SOS is already active for this trip (idempotent — returns existing) |
| `SAFETY_SHARE_NOT_FOUND`           | 404  | Share token does not exist                                             |
| `SAFETY_SHARE_EXPIRED`             | 410  | Share token exists but has expired or been revoked                     |
| `SAFETY_SHARE_ALREADY_ACTIVE`      | 200  | A share is already active for this trip (returns existing token)       |
| `SAFETY_INVALID_TRIP`              | 422  | Trip does not belong to the caller or is not in a shareable state      |
| `SAFETY_EVIDENCE_TOO_LARGE`        | 413  | Evidence file exceeds 10 MB limit                                      |
| `SAFETY_EVIDENCE_INVALID_TYPE`     | 422  | Evidence MIME type not allowed (only jpeg, png, audio/mp4)             |
| `SAFETY_CHECK_IN_NOT_FOUND`        | 404  | Check-in not found or not addressed to caller                          |
| `SAFETY_CHECK_IN_ALREADY_RESOLVED` | 409  | Check-in is no longer in `pending` state                               |

---

## Emergency Contacts

### `GET /safety/contacts`

Returns the authenticated user's emergency contacts.

**Auth**: Required.

**Response `200 OK`**:

```json
{
  "contacts": [
    {
      "id": "uuid",
      "name": "Mum",
      "phone": "+6799123456",
      "label": "Mother",
      "isActive": true,
      "createdAt": "2026-03-16T08:00:00Z"
    }
  ]
}
```

---

### `POST /safety/contacts`

Adds a new emergency contact.

**Auth**: Required.

**Request body**:

```json
{
  "name": "Mum",
  "phone": "+6799123456",
  "label": "Mother"
}
```

| Field   | Type   | Required | Validation                                       |
| ------- | ------ | -------- | ------------------------------------------------ |
| `name`  | string | Yes      | 1–80 chars                                       |
| `phone` | string | Yes      | Valid E.164 phone number, normalised server-side |
| `label` | string | No       | Max 30 chars                                     |

**Response `201 Created`**:

```json
{
  "id": "uuid",
  "name": "Mum",
  "phone": "+6799123456",
  "label": "Mother",
  "isActive": true,
  "createdAt": "2026-03-16T08:00:00Z"
}
```

**Error responses**: `401`, `409 SAFETY_CONTACT_LIMIT_REACHED`.

---

### `DELETE /safety/contacts/:contactId`

Removes an emergency contact. The caller must own the contact.

**Auth**: Required.

**Response `204 No Content`**

**Error responses**: `401`, `404 SAFETY_CONTACT_NOT_FOUND`.

---

### `POST /safety/contacts/test-alert`

Sends a test SMS to all active emergency contacts for the authenticated user. No
`safetyIncident` row is created.

**Auth**: Required.

**Request body**: _(empty)_

**Response `200 OK`**:

```json
{
  "dispatchedTo": 2,
  "message": "Test alert sent to your emergency contacts."
}
```

> `dispatchedTo` is the count of contacts the SMS was queued for. Delivery
> success is asynchronous — the SMS provider result is not reflected here.

**Error responses**: `401`.

---

## SOS

### `POST /safety/sos`

Triggers an SOS for the caller's current active trip. Idempotent within 60
seconds: if an SOS is already active for this trip, the existing incident is
returned with HTTP `200` and no duplicate SMS is sent.

**Auth**: Required.

**Request body**:

```json
{
  "tripId": "uuid",
  "locationJson": "{\"type\":\"Point\",\"coordinates\":[178.4415,-18.1416]}",
  "silent": false
}
```

| Field          | Type    | Required | Validation                                                           |
| -------------- | ------- | -------- | -------------------------------------------------------------------- |
| `tripId`       | string  | Yes      | Must be an active trip belonging to the caller                       |
| `locationJson` | string  | No       | GeoJSON Point string. If absent, last telemetry coordinate is used.  |
| `silent`       | boolean | No       | `true` when triggered by the volume-button gesture. Default `false`. |

**Response `201 Created`** (new incident) or **`200 OK`** (existing):

```json
{
  "incidentId": "uuid",
  "referenceCode": "SAF-260316-A7X2",
  "status": "active",
  "emergencyNumbers": {
    "ambulance": "911",
    "police": "917",
    "fire": "910"
  },
  "contactsNotified": 2,
  "existingShare": {
    "token": "abc123…",
    "shareUrl": "https://hakwa.com/s/abc123…"
  }
}
```

> `contactsNotified` is the count of active contacts the SMS was queued for
> (asynchronous — delivery not confirmed at this point). `existingShare` is
> `null` if no active `tripShare` exists.

**Error responses**: `401`, `422 SAFETY_NO_ACTIVE_TRIP`.

---

### `POST /safety/sos/:incidentId/acknowledge`

Used by the safety-team dashboard to acknowledge an active SOS. Requires the
`safety_admin` role.

**Auth**: Required (`safety_admin` role).

**Request body**: _(empty)_

**Response `200 OK`**:

```json
{
  "incidentId": "uuid",
  "status": "acknowledged",
  "acknowledgedAt": "2026-03-16T10:03:00Z"
}
```

**Error responses**: `401`, `403` (not safety_admin),
`404 SAFETY_INCIDENT_NOT_FOUND`.

---

## Trip Sharing

### `POST /safety/trips/:tripId/share`

Creates (or returns existing) a live-share session for the given trip. If an
active share already exists the existing token is returned (`200 OK`).

**Auth**: Required. Caller must be the passenger on the trip.

**Request body**: _(empty)_

**Response `201 Created`** (new share) or **`200 OK`** (existing):

```json
{
  "token": "abc123…64chars",
  "shareUrl": "https://hakwa.com/s/abc123…",
  "expiresAt": "2026-03-16T11:15:00Z",
  "status": "active"
}
```

**Error responses**: `401`, `422 SAFETY_INVALID_TRIP`.

---

### `DELETE /safety/trips/:tripId/share`

Revokes the active share for the given trip. After revocation, the share URL
returns `410 Gone`.

**Auth**: Required. Caller must be the passenger on the trip.

**Response `204 No Content`**

**Error responses**: `401`, `422 SAFETY_INVALID_TRIP`,
`404 SAFETY_SHARE_NOT_FOUND`.

---

### `GET /safety/share/:token` _(unauthenticated)_

Returns the current trip details for a live-share viewer. This is the public
endpoint opened by the viewer's browser. No authentication is required — the
token is the access credential.

**Auth**: None required.

**Response `200 OK`**:

```json
{
  "status": "active",
  "bookingStatus": "in_progress",
  "driver": {
    "firstName": "Ahmed",
    "photoUrl": "https://cdn.hakwa.com/avatars/uuid.jpg",
    "vehicleMake": "Toyota",
    "vehicleModel": "Hiace",
    "vehicleColour": "White",
    "vehiclePlate": "FJ 1234"
  },
  "passenger": {
    "lastLocation": {
      "type": "Point",
      "coordinates": [178.4415, -18.1416]
    },
    "updatedAt": "2026-03-16T10:02:45Z"
  },
  "eta": {
    "minutes": 8,
    "destination": "Suva CBD"
  },
  "expiresAt": "2026-03-16T11:15:00Z"
}
```

> **PII note**: `driver` contains first name only (no surname, no phone). No
> passenger PII beyond GPS coordinates is included. (FR-010)

**Error responses**:

- `404 SAFETY_SHARE_NOT_FOUND` — token does not exist
- `410 SAFETY_SHARE_EXPIRED` — token is expired or revoked. Body:

```json
{
  "code": "SAFETY_SHARE_EXPIRED",
  "message": "This tracking link has expired. The trip ended safely."
}
```

---

### `GET /safety/share/:token/stream` _(unauthenticated, SSE)_

Server-Sent Events endpoint. Streams live GPS updates to the share viewer's
browser. The response uses `Content-Type: text/event-stream`.

**Auth**: None required.

**Event format**:

```
event: location
data: {"lat":-18.1416,"lng":178.4415,"updatedAt":"2026-03-16T10:02:45Z","bookingStatus":"in_progress","etaMinutes":8}

event: share_expired
data: {"message":"This tracking link has expired."}
```

Events sent:

| Event           | Sent when                                                     |
| --------------- | ------------------------------------------------------------- |
| `location`      | Every ≤5 seconds when new driver GPS is available             |
| `share_expired` | When `tripShare.status` transitions to `expired` or `revoked` |
| `trip_ended`    | When the underlying trip reaches `completed` or `cancelled`   |

The server closes the SSE connection after `share_expired` or `trip_ended`.

---

## Vehicle Verification

### `GET /safety/trips/:tripId/verify`

Returns the 4-digit safety code and full vehicle details for a booking. Used by
the passenger BEFORE boarding to verify they are in the right vehicle.

No server-side secret round-trip: the code is computed server-side for the
response but clients CAN also derive it locally using the SDK if offline.

**Auth**: Required. Caller must be the passenger on the trip.

**Response `200 OK`**:

```json
{
  "safetyCode": "4821",
  "vehicle": {
    "make": "Toyota",
    "model": "Hiace",
    "colour": "White",
    "plate": "FJ 1234",
    "year": 2019
  },
  "driver": {
    "firstName": "Ahmed",
    "photoUrl": "https://cdn.hakwa.com/avatars/uuid.jpg"
  },
  "codeRotatesAt": "2026-03-17T00:00:00Z"
}
```

**Error responses**: `401`, `422 SAFETY_INVALID_TRIP`.

---

### `POST /safety/trips/:tripId/wrong-vehicle`

Reports a wrong-vehicle situation. Creates a `safetyIncident` of
`type = "wrong_vehicle"` and `category = "wrong_vehicle"`, triggering automatic
driver suspension (FR-018).

**Auth**: Required. Caller must be the passenger on the trip.

**Request body**:

```json
{
  "description": "Driver arrived in a red Mazda, booking showed white Toyota."
}
```

| Field         | Type   | Required | Validation      |
| ------------- | ------ | -------- | --------------- |
| `description` | string | No       | Max 1 000 chars |

**Response `201 Created`**:

```json
{
  "incidentId": "uuid",
  "referenceCode": "SAF-260316-B3Y9",
  "status": "open",
  "message": "Report received. Please stay where you are. Do not board the vehicle."
}
```

**Error responses**: `401`, `422 SAFETY_INVALID_TRIP`.

---

## Incident Reporting

### `POST /safety/incidents/report`

Files a formal safety incident report. The `tripId` MUST be a trip the caller
participated in (as passenger or driver).

**Auth**: Required.

**Request body**:

```json
{
  "tripId": "uuid",
  "category": "dangerous_driving",
  "description": "Driver was swerving and did not slow down for speed bumps.",
  "evidenceUrl": "https://cdn.hakwa.com/safety-evidence/uuid.jpg"
}
```

| Field         | Type        | Required | Validation                                                                                                                                 |
| ------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `tripId`      | string      | Yes      | Trip the caller was a party to                                                                                                             |
| `category`    | string enum | Yes      | `assault` \| `inappropriate_behaviour` \| `wrong_vehicle` \| `dangerous_driving` \| `verbal_abuse` \| `overcharge` \| `no_show` \| `other` |
| `description` | string      | No       | Max 2 000 chars                                                                                                                            |
| `evidenceUrl` | string      | No       | Pre-signed CDN URL to an already-uploaded evidence file (FR-020)                                                                           |

**Response `201 Created`**:

```json
{
  "incidentId": "uuid",
  "referenceCode": "SAF-260316-C5Z1",
  "status": "open",
  "driverSuspended": false,
  "message": "Your report has been received. Reference: SAF-260316-C5Z1."
}
```

> `driverSuspended` is `true` only when `category` is `assault` or
> `wrong_vehicle` (FR-018).

**Error responses**: `401`, `422 SAFETY_INVALID_TRIP`.

---

### `GET /safety/history`

Returns the authenticated user's paginated safety history: SOS activations,
incident reports filed, and check-in escalations ordered by `createdAt` desc.

**Auth**: Required.

**Query params**:

| Param   | Type    | Default | Description           |
| ------- | ------- | ------- | --------------------- |
| `page`  | integer | 1       | Page number (1-based) |
| `limit` | integer | 20      | Max 50                |

**Response `200 OK`**:

```json
{
  "items": [
    {
      "id": "uuid",
      "referenceCode": "SAF-260316-A7X2",
      "type": "sos",
      "category": null,
      "status": "resolved",
      "tripId": "uuid",
      "createdAt": "2026-03-16T10:01:00Z",
      "resolvedAt": "2026-03-16T10:45:00Z",
      "resolutionOutcome": "driver_actioned"
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 20
}
```

**Error responses**: `401`.

---

## Safety Check-ins

### `POST /safety/check-ins/:checkInId/respond`

The passenger responds to a server-generated check-in prompt. Must be called
within 90 seconds or escalation fires automatically.

**Auth**: Required. Caller must be the `user_id` on the `safetyCheckIn` row.

**Request body**:

```json
{
  "response": "ok"
}
```

| Field      | Type        | Required | Validation           |
| ---------- | ----------- | -------- | -------------------- |
| `response` | string enum | Yes      | `"ok"` \| `"cancel"` |

- `"ok"` → `safetyCheckIn.status = "ok_confirmed"`. No escalation.
- `"cancel"` → `safetyCheckIn.status = "cancelled"`. Cancels pending escalation
  if it has not yet fired.

**Response `200 OK`**:

```json
{
  "checkInId": "uuid",
  "status": "ok_confirmed",
  "escalationCancelled": false
}
```

**Error responses**: `401`, `403` (not owner), `404 SAFETY_CHECK_IN_NOT_FOUND`,
`409 SAFETY_CHECK_IN_ALREADY_RESOLVED`.
