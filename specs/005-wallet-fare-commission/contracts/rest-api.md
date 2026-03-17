# API Contracts: Wallet, Fare & Commission

All endpoints require `Authorization: Bearer <session-token>`.

---

## Fare Estimation (Passenger)

### `POST /api/bookings/fare-estimate`

> Defined in spec 003 contracts. Documented here for fare logic context.

**Request**:

```json
{
  "pickupLat": -18.1416,
  "pickupLng": 178.4415,
  "dropoffLat": -18.14,
  "dropoffLng": 178.45
}
```

**Response 200**:

```json
{
  "estimatedFare": "9.50",
  "estimatedDistanceKm": "8.24",
  "baseFare": "2.50",
  "ratePerKm": "0.85",
  "currency": "FJD"
}
```

**Error**: `422 Unprocessable Entity` if distance ≤ 0 or coords invalid.

---

## Merchant Wallet

All `/api/merchant/wallet/*` endpoints require `role = merchant`.

### `GET /api/merchant/wallet/balance`

Current wallet balance and pending payout information.

**Response 200**:

```json
{
  "balance": "142.50",
  "currency": "FJD",
  "pendingPayoutAmount": "0.00",
  "lastPayoutAt": "2026-03-10T00:00:00Z"
}
```

---

### `GET /api/merchant/wallet/ledger?cursor=<id>&limit=20`

Paginated ledger history.

**Response 200**:

```json
{
  "items": [
    {
      "id": "uuid",
      "entryType": "trip_credit",
      "amount": "8.84",
      "label": "Trip earnings",
      "tripId": "uuid",
      "payoutId": null,
      "createdAt": "2026-03-17T09:20:00Z"
    },
    {
      "id": "uuid",
      "entryType": "payout_debit",
      "amount": "-140.00",
      "label": "Weekly payout",
      "tripId": null,
      "payoutId": "uuid",
      "createdAt": "2026-03-10T00:00:00Z"
    }
  ],
  "nextCursor": "uuid | null"
}
```

---

## Passenger Trip Receipt

### `GET /api/trips/:tripId/receipt`

Retrieve trip receipt. Caller must be the passenger of the trip.

**Response 200**:

```json
{
  "tripId": "uuid",
  "pickupAddress": "Kings Road, Suva",
  "dropoffAddress": "Nadi Airport, Nadi",
  "actualDistanceKm": "7.20",
  "baseFare": "2.50",
  "ratePerKm": "0.85",
  "totalFare": "8.62",
  "currency": "FJD",
  "completedAt": "2026-03-17T09:20:00Z"
}
```

**Response 403** — Caller is not the trip passenger.

---

### `POST /api/trips/:tripId/receipt/email`

Send receipt to passenger's registered email.

**Response 202** — Email queued via Redis Stream.

**Response 409** — Trip not yet completed.

---

## WebSocket Events (Sent to Merchant)

Channel: `wallet:updated:{merchantId}`

| Event             | Payload                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `balance_updated` | `{ balance: "142.50", delta: "8.84", entryType: "trip_credit", tripId: "uuid" }` |

Pushed immediately after trip completion ledger entries are written.
