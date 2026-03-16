# Research: Merchant Onboarding

_Phase 0 output for `002-merchant-onboarding`_

---

## 1. Onboarding State Machine

**Decision**: Merchant onboarding status is stored as a `status` enum on the
`merchant` table. The lifecycle is:
`draft → under_review → approved | rejected`.

**Rationale**:

- A simple state field on the existing `merchant` record avoids a separate
  `merchantOnboarding` table and keeps queries straightforward.
- `draft` represents an in-progress wizard (steps completed but not submitted).
  The wizard can be resumed at any step.
- `under_review` is set atomically on wizard submission; Hakwa staff are
  notified via the notification system.
- `approved` and `rejected` are set by admin tooling (out of Phase 1 scope);
  drivers/merchants with `approved` status can receive bookings.
- `suspended_pending_review` is reserved for safety-system escalations (spec
  010), added as an additive enum value.

**Wizard step tracking**:

Rather than a step counter, onboarding completeness is derived from presence of
associated records:

- Business details complete: `merchant.tin` (or `merchant.nationalId` for
  unlicensed) is populated.
- Bank account complete: `bankAccount` row exists for the merchant.
- Vehicle complete: at least one `vehicle` row exists linked to the merchant.

This keeps the wizard resumable without a separate `onboardingStep` field.

---

## 2. Licensed vs Unlicensed Merchant Split

**Decision**: A `licenseType` column (`"licensed" | "unlicensed"`) on `merchant`
gates which onboarding fields are required.

**Rationale**:

- The constitution mandates that both licensing tiers are explicitly handled —
  silent defaulting to one tier is forbidden.
- Licensed merchants require `tin` + `businessRegistrationNumber`. Unlicensed
  require `nationalId`. Conditional validation in the API service checks
  `licenseType` before enforcing non-null rules.
- The frontend wizard dynamically omits TIN/LTA fields for unlicensed merchants,
  driven by the same `licenseType` value returned in the session.

**Alternatives considered**:

- Separate `licensedMerchant` / `unlicensedMerchant` tables: maximally type-
  safe but duplicates name, vehicle, and bank account relationships. Rejected.
- A nullable `tin` column for licensed + nullable `nationalId` for unlicensed
  on a single table: chosen approach; the constraint is enforced at the service
  layer against `licenseType`.

---

## 3. Vehicle Registration

**Decision**: Vehicles are stored in a `vehicle` table (not the existing `ride`
table) linked to the `merchant` via `merchantId`.

**Rationale**:

- The existing `ride` table in `merchant.ts` conflates the concept of a "ride
  type/class" with a physical vehicle. For onboarding, Hakwa needs to track
  specific vehicle attributes: make, model, year, registration plate, and
  seating capacity — not present on `ride`.
- A dedicated `vehicle` table is the clean contract. The `ride` record can
  reference the `vehicle` for future dispatch pairing.
- Seating capacity is stored here so future minibus/bus modes can derive seat
  inventory from this record.

---

## 4. Admin Notification on Submission

**Decision**: On `submit_for_review`, the API dispatches a `system_alert`
notification to all users with `role = admin` via the notification system
(spec 008), using the Redis Stream pipeline.

**Rationale**:

- Keeps onboarding decoupled from any specific notification channel; the
  notification system handles push/email/in-app delivery.
- `system_alert` type is not suppressible by user preference (constitution
  principle XIV), ensuring staff always receive the alert.
- The dispatch is a post-commit event (Redis XADD after the transaction
  commits), not inline in the transaction, per Principle IX.

---

## 5. Bank Account Storage

**Decision**: Reuse the existing `bankAccount` table in `wallet.ts`.
`holderType = 'merchant'` and `holderId = merchant.id` link it to the merchant.

**Rationale**:

- The `bankAccount` table was designed with a generic `holderType / holderId`
  pattern specifically for this reuse.
- No new table needed; the payout system (spec 006) already queries
  `bankAccount` by `holderType = 'merchant'`.

---
