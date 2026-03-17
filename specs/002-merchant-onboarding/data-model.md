# Data Model: Merchant Onboarding

**Feature**: 002-merchant-onboarding  
**Schema files**: `pkg/db/schema/merchant.ts` (extended),
`pkg/db/schema/wallet.ts` (reused)  
**Last updated**: 2026-03-17

---

## Overview

The existing `merchant` table gains `status`, `licenseType`, `nationalId`, and
`userId` columns. A new `vehicle` table is introduced for physical vehicle
records. The existing `bankAccount` table (wallet.ts) is reused for payout bank
details.

---

## Changes to Existing Tables

### `merchant` — additive columns

| New Column    | Type          | Constraint                                         | Notes                                                                                 |
| ------------- | ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `userId`      | `text`        | NOT NULL, UNIQUE, FK → `user.id` ON DELETE CASCADE | Links merchant record to the owning user account                                      |
| `licenseType` | `text`        | NOT NULL                                           | `'licensed' \| 'unlicensed'`                                                          |
| `status`      | `text`        | NOT NULL, default `'draft'`                        | `'draft' \| 'under_review' \| 'approved' \| 'rejected' \| 'suspended_pending_review'` |
| `nationalId`  | `varchar(50)` | nullable                                           | Required when `licenseType = 'unlicensed'`; null otherwise                            |
| `phone`       | `varchar(30)` | nullable                                           | Merchant contact number                                                               |

> `tin` and `businessRegistrationNumber` already exist on the `merchant` table;
> they remain nullable at the DB level with service-layer conditional
> validation.

---

## New Table

### `vehicle`

Physical vehicles owned by a merchant. Required: at least one vehicle per
merchant before submission.

```
vehicle
├── id                  uuid          PK, random
├── merchantId          uuid          NOT NULL, FK → merchant.id ON DELETE CASCADE
├── make                varchar(80)   NOT NULL               e.g. "Toyota"
├── model               varchar(80)   NOT NULL               e.g. "Corolla"
├── year                smallint      NOT NULL               e.g. 2019
├── registrationPlate   varchar(20)   NOT NULL, UNIQUE       LTA-registered plate
├── seatingCapacity     smallint      NOT NULL               Excludes driver
├── color               varchar(40)   nullable
├── isActive            boolean       NOT NULL, default true
├── createdAt           timestamp     NOT NULL, default now()
└── updatedAt           timestamp     NOT NULL, default now(), $onUpdate
```

**Indexes**:

- UNIQUE on `registrationPlate` (prevents duplicate plate registration).
- B-tree on `merchantId` (vehicle list queries per merchant).

---

## Reused Tables (unchanged structure)

### `bankAccount` (wallet.ts)

Merchant payout bank details use `holderType = 'merchant'`,
`holderId = merchant.id`.

| Column              | Type         | Notes                             |
| ------------------- | ------------ | --------------------------------- |
| `holderType`        | `HolderType` | `'merchant'` for merchant payouts |
| `holderId`          | `varchar`    | Foreign key value (`merchant.id`) |
| `accountNumber`     | `varchar`    | Bank account number               |
| `accountHolderName` | `varchar`    | Name on the account               |
| `bankName`          | `varchar`    | e.g. "ANZ Fiji"                   |
| `bankCode`          | `varchar`    | BSB or local bank code            |
| `swiftCode`         | `varchar`    | SWIFT/BIC for international wires |

---

## Merchant Status Lifecycle

```
draft ──► under_review ──► approved
                       └──► rejected
approved ──► suspended_pending_review  (safety system escalation)
```

---

## Schema Relationships

```
user ──────────────────── merchant (1:1 via userId)
merchant ──────────────── vehicle (1:many)
merchant ──────────────── bankAccount (1:1 via holderType/holderId)
merchant ──────────────── operator (1:many, existing)
```
