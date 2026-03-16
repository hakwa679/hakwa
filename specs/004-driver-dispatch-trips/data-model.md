# Data Model: Driver Dispatch & Trips

## Schema Extension: `user` table

Add `availabilityStatus` and `driverProfileId` columns (migration: `db-push`).

```typescript
// pkg/db/schema/auth-schema.ts — extend user table
export const availabilityStatusEnum = pgEnum('availability_status', [
  'offline',
  'available',
  'on_trip',
]);

// add to user table definition:
availabilityStatus: availabilityStatusEnum('availability_status')
  .default('offline')
  .notNull(),
```

> Note: The `user` table is owned by Better Auth. Columns added here are "extra"
> columns that Better Auth will not touch. Drizzle maps them normally.

---

## Schema Extension: `trip` table (from spec 003)

The status transition for driver ops leverages the extended `trip` table defined
in spec 003. Driver-specific columns added here:

| Column             | Type                        | Description                        |
| ------------------ | --------------------------- | ---------------------------------- |
| `driverId`         | `uuid` references `user.id` | Set atomically on accept           |
| `acceptedAt`       | `timestamp`                 | When driver accepted               |
| `startedAt`        | `timestamp`                 | When driver tapped "Start trip"    |
| `completedAt`      | `timestamp`                 | When driver tapped "Complete trip" |
| `actualDistanceKm` | `numeric(8,3)`              | Reported by driver at completion   |
| `actualFare`       | `numeric(10,2)`             | Computed from actual distance      |

These are already defined in the spec 003 data model as part of the extended
`trip` schema — recorded here for driver-side context.

---

## State Machine: Trip Status (Driver Perspective)

```
pending
  ↓ driver accepts (conditional UPDATE)
accepted
  ↓ driver taps "I've arrived"
driver_arrived
  ↓ driver taps "Start trip"
in_progress
  ↓ driver taps "Complete trip"
completed

(any state before in_progress) → cancelled  (dispatch loop exhausted or timeout)
```

Driver is bound from `accepted` → `driver_arrived` → `in_progress` →
`completed`. A driver cannot cancel once `in_progress`.

---

## Redis Structures

### Driver Location Hash

Key: `driver:{userId}:loc`  
TTL: 60 seconds (refreshed on every POST /api/driver/location)

| Field       | Type           | Example                  |
| ----------- | -------------- | ------------------------ |
| `lat`       | string (float) | `"-18.1416"`             |
| `lng`       | string (float) | `"178.4415"`             |
| `heading`   | string (int)   | `"270"`                  |
| `updatedAt` | string (ISO)   | `"2026-03-17T08:30:00Z"` |

### Booking Offer Hash

Key: `offer:{tripId}:{driverId}`  
TTL: 30 seconds (offer window)

| Field    | Value                                     |
| -------- | ----------------------------------------- |
| `tripId` | UUID                                      |
| `status` | `sent \| accepted \| declined \| expired` |

### Dispatch Channel

Pub/Sub channel: `booking:{tripId}:status`  
Published by: `bookingService` when status changes  
Consumed by: `dispatchLoop` (to abort when accepted); WebSocket fan-out server

---

## Earnings View

No new table. Earnings are read from `ledgerEntry` where:

- `holderType = 'merchant'`
- `entryType = 'trip_credit'`
- `holderId = driver.merchantId`

Joined to `trip` for `pickupAddress`, `dropoffAddress`, `completedAt`.
