# API Contracts: Weekly Merchant Payouts

All endpoints require `Authorization: Bearer <session-token>`.

---

## Merchant Payout History

### `GET /api/merchant/payouts?cursor=<id>&limit=20`

Paginated payout history for the authenticated merchant. Role: `merchant`.

**Response 200**:

```json
{
  "items": [
    {
      "id": "uuid",
      "weekStart": "2026-03-10",
      "weekEnd": "2026-03-16",
      "amount": "140.00",
      "serviceFee": "1.00",
      "netAmount": "139.00",
      "status": "succeeded",
      "processedAt": "2026-03-17T00:00:00Z",
      "completedAt": "2026-03-17T00:05:00Z",
      "bankAccount": {
        "bankName": "ANZ Pacific",
        "accountNumberLast4": "4782"
      }
    }
  ],
  "nextCursor": "uuid | null",
  "nextPayoutDate": "2026-03-24T00:00:00Z"
}
```

---

### `GET /api/merchant/payouts/:payoutId`

Detail view of a single payout. Role: `merchant`.

**Response 200**:

```json
{
  "id": "uuid",
  "weekStart": "2026-03-10",
  "weekEnd": "2026-03-16",
  "amount": "140.00",
  "serviceFee": "1.00",
  "netAmount": "139.00",
  "status": "failed",
  "failureReason": "Invalid bank account number",
  "bankAccount": {
    "bankName": "ANZ Pacific",
    "accountNumberLast4": "4782"
  },
  "note": "Funds remain in your wallet balance and will be included in the next payout."
}
```

**Response 403** — Payout belongs to a different merchant.

---

## Admin / Internal

> These endpoints are internal-only and not exposed to the public API. Triggered
> by the cron worker.

### `POST /internal/payouts/batches` _(internal, worker auth)_

Create the weekly payout batch. Idempotent via DB unique constraint.

**Request**:

```json
{ "weekStart": "2026-03-10" }
```

**Response 201** — Batch created.

**Response 200** — Batch already exists for this week (no-op).

---

### `POST /internal/payouts/batches/:batchId/process` _(internal, worker auth)_

Start processing all pending payouts in the batch.

**Response 202** — Processing started asynchronously.

---

### `POST /internal/payouts/:payoutId/retry` _(internal, worker auth)_

Retry a failed payout within the same batch week.

**Response 200**:

```json
{ "payoutId": "uuid", "status": "processing" }
```

**Response 409** — Payout is not in `failed` state.
