# REST API Contract: Merchant Onboarding

**Feature**: 002-merchant-onboarding  
**Base path**: `/api/merchants`  
**Auth**: Required — session token / cookie; `role = 'merchant'`

---

## Merchant Profile

### `GET /api/merchants/me`

Get the current authenticated merchant's profile including onboarding status.

**Response `200`**:

```json
{
  "id": "uuid",
  "userId": "text",
  "name": "Island Cabs Ltd",
  "licenseType": "licensed",
  "status": "under_review",
  "tin": "FJ123456",
  "businessRegistrationNumber": "LTA-789",
  "nationalId": null,
  "phone": "+679 123 4567",
  "onboardingSteps": {
    "businessDetails": true,
    "bankAccount": true,
    "vehicle": true
  }
}
```

---

### `PATCH /api/merchants/me`

Update business details (allowed in `draft` and `under_review` states).

**Request body** (partial update — only send fields to change):

```json
{
  "name": "Island Cabs Ltd",
  "tin": "FJ123456",
  "businessRegistrationNumber": "LTA-789",
  "nationalId": null,
  "phone": "+679 123 4567"
}
```

**Validation**:

- If `licenseType = 'licensed'`: `tin` + `businessRegistrationNumber` required.
- If `licenseType = 'unlicensed'`: `nationalId` required.

**Response `200`**: Updated merchant object.

**Errors**:

| Status | Code               | Condition                        |
| ------ | ------------------ | -------------------------------- |
| `403`  | `NOT_EDITABLE`     | Merchant status is `approved`    |
| `422`  | `VALIDATION_ERROR` | Missing required fields for tier |

---

### `POST /api/merchants/me/submit`

Submit the completed onboarding for admin review. Transitions status to
`under_review`.

**Validation**: All three onboarding sections must be complete before submission
is accepted.

**Response `200`**: `{ "status": "under_review" }`

**Errors**:

| Status | Code                    | Condition                                          |
| ------ | ----------------------- | -------------------------------------------------- |
| `422`  | `INCOMPLETE_ONBOARDING` | Missing business details, bank account, or vehicle |
| `409`  | `ALREADY_SUBMITTED`     | Status is already `under_review` or later          |

---

## Bank Account

### `GET /api/merchants/me/bank-account`

Get the merchant's registered payout bank account.

**Response `200`**: Bank account object or `null` if not yet set.

---

### `PUT /api/merchants/me/bank-account`

Create or replace the payout bank account (idempotent upsert).

**Request body**:

```json
{
  "accountNumber": "1234567890",
  "accountHolderName": "Island Cabs Ltd",
  "bankName": "ANZ Fiji",
  "bankCode": "010101",
  "swiftCode": "ANZBFJFX"
}
```

**Response `200`**: Updated bank account object.

**Errors**:

| Status | Code           | Condition                     |
| ------ | -------------- | ----------------------------- |
| `403`  | `NOT_EDITABLE` | Merchant status is `approved` |

---

## Vehicles

### `GET /api/merchants/me/vehicles`

List all vehicles registered to the merchant.

**Response `200`**: `{ "vehicles": [ { "id": "...", "make": "Toyota", ... } ] }`

---

### `POST /api/merchants/me/vehicles`

Register a new vehicle.

**Request body**:

```json
{
  "make": "Toyota",
  "model": "Corolla",
  "year": 2019,
  "registrationPlate": "FJ1234",
  "seatingCapacity": 4,
  "color": "White"
}
```

**Response `201`**: Created vehicle object.

**Errors**:

| Status | Code                   | Condition                              |
| ------ | ---------------------- | -------------------------------------- |
| `409`  | `PLATE_ALREADY_EXISTS` | `registrationPlate` already registered |
| `422`  | `VALIDATION_ERROR`     | Missing required vehicle fields        |

---

### `PATCH /api/merchants/me/vehicles/:vehicleId`

Update a vehicle's details (allowed before submission).

**Response `200`**: Updated vehicle object.

---

### `DELETE /api/merchants/me/vehicles/:vehicleId`

Remove a vehicle (only allowed in `draft` status).

**Response `204`**: No content.

**Errors**:

| Status | Code           | Condition                                                                                       |
| ------ | -------------- | ----------------------------------------------------------------------------------------------- |
| `403`  | `NOT_EDITABLE` | Cannot remove vehicles after submission                                                         |
| `422`  | `LAST_VEHICLE` | Cannot remove the only vehicle (must have ≥ 1 for submission) — note: allowed before submission |
