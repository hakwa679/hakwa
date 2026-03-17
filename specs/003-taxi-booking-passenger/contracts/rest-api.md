# REST API & WebSocket Contract: Taxi Booking — Passenger

**Feature**: 003-taxi-booking-passenger  
**Base path**: `/api/bookings`  
**Auth**: Required — session token / cookie; `role = 'passenger'`

---

## REST Endpoints

### `POST /api/bookings/fare-estimate`

Calculate a fare estimate before creating a booking.

**Request body**:

```json
{
  "pickupLat": -18.141,
  "pickupLng": 178.441,
  "destinationLat": -18.155,
  "destinationLng": 178.425
}
```

**Response `200`**:

```json
{
  "estimatedFare": "8.50",
  "estimatedDistanceKm": "7.06",
  "currency": "FJD",
  "breakdown": {
    "baseFare": "2.50",
    "distanceFare": "6.00"
  }
}
```

**Errors**:

| Status | Code               | Condition                        |
| ------ | ------------------ | -------------------------------- |
| `422`  | `INVALID_LOCATION` | Coordinates outside service area |

---

### `POST /api/bookings`

Create a new booking request.

**Request body**:

```json
{
  "pickupLat": -18.141,
  "pickupLng": 178.441,
  "pickupAddress": "Kings Road, Suva",
  "destinationLat": -18.155,
  "destinationLng": 178.425,
  "destinationAddress": "MHCC Mall, Suva"
}
```

**Response `201`**:

```json
{
  "tripId": "uuid",
  "status": "pending",
  "estimatedFare": "8.50",
  "estimatedDistanceKm": "7.06",
  "createdAt": "ISO8601"
}
```

**Errors**:

| Status | Code                    | Condition                                        |
| ------ | ----------------------- | ------------------------------------------------ |
| `409`  | `ACTIVE_BOOKING_EXISTS` | Passenger already has a pending/accepted booking |
| `422`  | `INVALID_LOCATION`      | Coordinates outside service area                 |

---

### `GET /api/bookings/:tripId`

Get a booking's current status and details.

**Response `200`**:

```json
{
  "tripId": "uuid",
  "status": "accepted",
  "driver": {
    "id": "...",
    "name": "David K.",
    "vehicle": {
      "make": "Toyota",
      "model": "Corolla",
      "plate": "FJ1234",
      "color": "White"
    }
  },
  "estimatedFare": "8.50",
  "estimatedArrivalMinutes": 3,
  "pickupAddress": "Kings Road, Suva",
  "destinationAddress": "MHCC Mall, Suva"
}
```

---

### `DELETE /api/bookings/:tripId`

Cancel a booking. Allowed from `pending` or `accepted` states only.

**Request body** (optional): `{ "reason": "Changed my mind" }`

**Response `200`**: `{ "status": "cancelled" }`

**Errors**:

| Status | Code                | Condition                                         |
| ------ | ------------------- | ------------------------------------------------- |
| `403`  | `CANNOT_CANCEL`     | Status is `in_progress`, `completed`, or terminal |
| `403`  | `NOT_BOOKING_OWNER` | Requesting user is not the booking passenger      |

---

### `GET /api/bookings/history`

Get the passenger's completed and cancelled trip history.

**Query params**: `?page=1&limit=20`

**Response `200`**:

```json
{
  "trips": [
    {
      "tripId": "uuid",
      "status": "completed",
      "fare": "8.50",
      "pickupAddress": "...",
      "destinationAddress": "...",
      "completedAt": "ISO8601",
      "driver": { "name": "David K." }
    }
  ],
  "total": 42,
  "page": 1
}
```

---

## WebSocket Events

### Connection

```
WS /ws?token=<session-token>
```

After connection, the client subscribes to trip events:

```json
{ "type": "subscribe", "channel": "trip", "tripId": "uuid" }
```

---

### Server → Client Events

#### `trip.status_changed`

```json
{
  "type": "trip.status_changed",
  "tripId": "uuid",
  "status": "accepted",
  "driver": {
    "name": "David K.",
    "vehicle": { "make": "Toyota", "plate": "FJ1234" },
    "estimatedArrivalMinutes": 4
  },
  "at": "ISO8601"
}
```

#### `trip.location_update`

Sent every ~5 seconds while booking is `accepted` or `in_progress`.

```json
{
  "type": "trip.location_update",
  "tripId": "uuid",
  "lat": -18.148,
  "lng": 178.437,
  "at": "ISO8601"
}
```

#### `trip.driver_arrived`

```json
{
  "type": "trip.driver_arrived",
  "tripId": "uuid",
  "at": "ISO8601"
}
```

#### `trip.completed`

```json
{
  "type": "trip.completed",
  "tripId": "uuid",
  "fare": "8.75",
  "actualDistanceKm": "7.29",
  "at": "ISO8601"
}
```

#### `trip.cancelled`

```json
{
  "type": "trip.cancelled",
  "tripId": "uuid",
  "cancelledBy": "driver",
  "reason": "Passenger unreachable",
  "at": "ISO8601"
}
```
