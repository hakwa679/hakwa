# API Contracts: Driver Dispatch & Trips

All endpoints require `Authorization: Bearer <session-token>` and the caller
must have role `driver`.

Base path: `/api/driver`

---

## Availability

### `PATCH /api/driver/availability`

Toggle driver online/offline status.

**Request**:

```json
{ "status": "available" }
```

`status`: `"available"` | `"offline"`

**Response 204** — No content on success.

**Response 409 Conflict** — Cannot go offline while `on_trip`.

---

### `POST /api/driver/location`

Report current GPS position. Called every 5 seconds by driver app.

**Request**:

```json
{
  "lat": -18.1416,
  "lng": 178.4415,
  "heading": 270
}
```

**Response 204** — No content.

**Side effects**:

- Writes to Redis hash `driver:{userId}:loc` (TTL 60 s).
- If driver has an active trip, publishes to `booking:{tripId}:location`.

---

## Booking Offers

### `POST /api/driver/bookings/:tripId/accept`

Accept a dispatch offer.

**Response 200**:

```json
{
  "tripId": "uuid",
  "passengerId": "uuid",
  "pickupAddress": "string",
  "pickupLat": -18.1416,
  "pickupLng": 178.4415,
  "estimatedFare": "9.50",
  "status": "accepted"
}
```

**Response 409 Conflict** — Booking already accepted by another driver.

**Response 410 Gone** — Offer window expired.

---

### `POST /api/driver/bookings/:tripId/decline`

Decline a dispatch offer. Driver remains `available`.

**Response 204** — No content.

---

## Trip Lifecycle

### `PATCH /api/driver/trips/:tripId/arrive`

Driver has arrived at pickup. Transitions status `accepted → driver_arrived`.

**Response 200**:

```json
{
  "tripId": "uuid",
  "status": "driver_arrived",
  "arrivedAt": "2026-03-17T09:00:00Z"
}
```

**Response 409** — Invalid status transition.

---

### `PATCH /api/driver/trips/:tripId/start`

Start trip. Transitions `driver_arrived → in_progress`.

**Response 200**:

```json
{
  "tripId": "uuid",
  "status": "in_progress",
  "startedAt": "2026-03-17T09:05:00Z",
  "dropoffAddress": "string",
  "dropoffLat": -18.14,
  "dropoffLng": 178.45
}
```

---

### `PATCH /api/driver/trips/:tripId/complete`

Complete trip. Transitions `in_progress → completed`. Triggers fare split.

**Request**:

```json
{ "actualDistanceKm": 7.2 }
```

**Response 200**:

```json
{
  "tripId": "uuid",
  "status": "completed",
  "actualFare": "8.62",
  "driverEarnings": "8.02",
  "platformFee": "0.60",
  "completedAt": "2026-03-17T09:20:00Z"
}
```

**Internal transaction**:

1. Update `trip`: `status = completed`, `actualDistanceKm`, `actualFare`,
   `completedAt`.
2. Insert `ledgerEntry` platform credit (7%).
3. Insert `ledgerEntry` merchant credit (93%).
4. Insert `pointsLedger` row (trip completion reward).

All in one Drizzle transaction.

---

## Earnings

### `GET /api/driver/earnings?cursor=<ledgerEntryId>&limit=20`

Paginated trip earnings history.

**Response 200**:

```json
{
  "items": [
    {
      "ledgerEntryId": "uuid",
      "tripId": "uuid",
      "pickupAddress": "string",
      "dropoffAddress": "string",
      "completedAt": "2026-03-17T09:20:00Z",
      "grossFare": "9.50",
      "driverEarnings": "8.84",
      "platformFee": "0.65"
    }
  ],
  "nextCursor": "uuid | null"
}
```

---

## WebSocket Events (Inbound — sent TO driver)

Channel subscribed on connection: `driver:{userId}:offer`

| Event             | Payload                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `booking_offer`   | `{ tripId, pickupAddress, pickupLat, pickupLng, distanceToPickupKm, estimatedFare, timeoutSeconds }` |
| `offer_expired`   | `{ tripId }`                                                                                         |
| `offer_cancelled` | `{ tripId, reason }`                                                                                 |
