# Data Model: Taxi Booking — Passenger

**Feature**: 003-taxi-booking-passenger  
**Schema file**: `pkg/db/schema/trip.ts` (extended)  
**Last updated**: 2026-03-17

---

## Overview

The existing `trip` table is extended with additional status values and new
columns. A new `booking` table captures the pre-trip request (pickup/destination
coordinates, fare estimate). A `driverLocation` structure lives in Redis — not
the database — for real-time position tracking.

---

## Changes to Existing Tables

### `trip` — additive columns & updated status enum

**Extended status enum**:

| Status           | Description                                           |
| ---------------- | ----------------------------------------------------- |
| `pending`        | booking created, searching for driver                 |
| `accepted`       | driver accepted, en route to pickup                   |
| `driver_arrived` | driver at pickup location                             |
| `in_progress`    | passenger in vehicle, trip underway                   |
| `completed`      | trip finished, fare finalised                         |
| `cancelled`      | cancelled by passenger or driver before `in_progress` |
| `timed_out`      | no driver accepted within timeout window              |

**New columns**:

| Column                | Type           | Constraint          | Notes                                                  |
| --------------------- | -------------- | ------------------- | ------------------------------------------------------ |
| `passengerId`         | `text`         | NOT NULL, FK → user | The passenger who requested the trip                   |
| `pickupLat`           | `numeric(9,6)` | NOT NULL            | Pickup latitude                                        |
| `pickupLng`           | `numeric(9,6)` | NOT NULL            | Pickup longitude                                       |
| `pickupAddress`       | `text`         | nullable            | Human-readable pickup address (from Nominatim geocode) |
| `destinationLat`      | `numeric(9,6)` | NOT NULL            | Destination latitude                                   |
| `destinationLng`      | `numeric(9,6)` | NOT NULL            | Destination longitude                                  |
| `destinationAddress`  | `text`         | nullable            | Human-readable destination address                     |
| `estimatedFare`       | `numeric(8,2)` | nullable            | Fare shown to passenger at booking time                |
| `estimatedDistanceKm` | `numeric(7,2)` | nullable            | Estimated route distance at booking time               |
| `actualDistanceKm`    | `numeric(7,2)` | nullable            | Set on trip completion from GPS trace                  |
| `cancellationReason`  | `text`         | nullable            | Passenger/driver provided reason on cancel             |
| `startedAt`           | `timestamp`    | nullable            | Set when status → `in_progress`                        |
| `completedAt`         | `timestamp`    | nullable            | Set when status → `completed`                          |
| `cancelledAt`         | `timestamp`    | nullable            | Set when status → `cancelled` or `timed_out`           |

---

## Redis Structures (non-persistent, real-time only)

### `driver:location:{driverId}`

Hash tracking the last known driver position. Updated by Driver App every 5 s
while online.

```
HSET driver:location:{driverId} lat {lat} lng {lng} updatedAt {iso8601}
EXPIRE driver:location:{driverId} 30   ; auto-expire after 30 s with no update
```

### `booking:{tripId}:status` (pub/sub channel)

Messages published when trip status changes. Consumed by WebSocket server.

```json
{
  "type": "status_changed",
  "tripId": "uuid",
  "status": "accepted",
  "at": "ISO8601"
}
```

### `booking:{tripId}:location` (pub/sub channel)

Driver location updates during active trip. Published every ~5 s.

```json
{
  "type": "location_update",
  "tripId": "uuid",
  "lat": -18.1,
  "lng": 178.4,
  "at": "ISO8601"
}
```

---

## Schema Relationships

```
user (passenger) ──────── trip (1:many, via passengerId)
user (driver) ──────────── trip (1:many, via driverId)
ride ───────────────────── trip (1:many, via rideId)
```
