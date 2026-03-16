# Feature Specification: Wallet, Fare & Commission

**Feature Branch**: `005-wallet-fare-commission`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: Wallet system for merchants and the platform, fare calculation, 7%
commission split on trip completion, ledger entries, and fare display for
passengers

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Fare Split on Trip Completion (Priority: P1)

When a driver completes a trip, the platform automatically computes the final
fare, splits 7% to the Hakwa platform wallet and 93% to the merchant wallet, and
records both as ledger entries in the same atomic transaction as the trip status
update. No manual action is required by any party.

**Why this priority**: Accurate, auditable fare splitting is the financial
backbone of the platform. Without it, neither merchants nor the platform can
track earnings.

**Independent Test**: Completing a trip from `in_progress` to `completed`
results in two ledger entries (platform credit and merchant credit) summing to
the gross fare, viewable immediately in both wallet records.

**Acceptance Scenarios**:

1. **Given** a trip in `in_progress` state with a final fare of FJD 10.00,
   **When** the driver marks the trip as completed, **Then** a platform ledger
   entry of FJD 0.70 (7%) and a merchant ledger entry of FJD 9.30 (93%) are
   created in the same transaction as the trip status change.
2. **Given** a completed trip, **When** the merchant views their wallet,
   **Then** the balance reflects the 93% credit and the ledger shows the trip
   reference and amount.
3. **Given** a completed trip, **When** the platform wallet is queried, **Then**
   the 7% credit is recorded against the same trip reference.
4. **Given** a database failure mid-transaction during trip completion, **When**
   the transaction rolls back, **Then** neither ledger entry is created and the
   trip status remains `in_progress` — no partial money movement occurs.

---

### User Story 2 - Fare Estimate Before Booking (Priority: P1)

Before a passenger confirms a booking, the platform computes an estimated fare
based on the pickup-to-destination distance and the platform's base fare
formula. The estimate is displayed to the passenger with a breakdown.

**Why this priority**: Passengers must see the estimated cost before committing.
Without this, the platform violates its own transparency principles and risks
passenger disputes.

**Independent Test**: Given a valid pickup and destination, the platform returns
a fare estimate to the passenger booking screen with a FJD total and a distance
component.

**Acceptance Scenarios**:

1. **Given** a passenger with a pickup and destination entered, **When** the
   fare estimate is requested, **Then** a total in FJD and the estimated
   distance are returned within 2 seconds.
2. **Given** a fare estimate of FJD X displayed at booking, **When** the trip is
   completed and the actual distance is within a normal variance, **Then** the
   final charged fare is FJD X (or clearly explained if different due to route
   deviation).

---

### User Story 3 - Merchant Views Wallet Balance and Ledger (Priority: P2)

A merchant opens the Merchant App and navigates to the Wallet section. They see
their current available balance and a full ledger of all credits (trip
completions) and debits (payout sweeps). Each ledger entry shows the amount,
type, a trip or payout reference, and the timestamp.

**Why this priority**: Wallet visibility builds merchant trust. It is also
required before merchants can understand their payout amounts.

**Independent Test**: A merchant with at least one completed trip can navigate
to Wallet and see their balance and the associated ledger entry.

**Acceptance Scenarios**:

1. **Given** a merchant with completed trips, **When** they open the Wallet tab,
   **Then** the current balance (sum of credits minus sum of debits) is
   prominently displayed in FJD with two decimal places.
2. **Given** the Wallet tab, **When** the merchant scrolls through the ledger,
   **Then** each entry shows: amount (positive for credit, negative for debit),
   type label (e.g., "Trip earnings", "Payout"), reference (trip ID or payout
   ID), and timestamp.
3. **Given** a new trip completion, **When** the merchant is viewing the Wallet
   tab, **Then** the new ledger entry and updated balance appear without
   requiring a manual refresh.

---

### User Story 4 - Passenger Trip Receipt (Priority: P2)

After a trip is completed, the passenger receives a detailed receipt — either
in-app immediately or via email — itemising the base fare, distance, and total
charged.

**Why this priority**: Receipts are expected for any paid service. They reduce
"I wasn't charged correctly" support queries.

**Independent Test**: A passenger with a completed trip can view a receipt with
a fare breakdown in the trip history.

**Acceptance Scenarios**:

1. **Given** a completed trip, **When** the passenger views the trip in their
   history, **Then** they see: pickup address, destination, distance (km), base
   fare, any adjustments (if applicable), and total charged in FJD.
2. **Given** a completed trip, **When** the passenger requests an email receipt,
   **Then** a formatted email receipt is sent to their registered address within
   2 minutes.

---

### Edge Cases

- What if the fare formula returns a negative or zero value (bad input)? The
  system MUST reject the calculation and return an error — a zero-fare trip is
  not permitted unless explicitly supported as a policy setting (which it is not
  in Phase 1).
- What if a concurrent request tries to read-then-write the merchant wallet
  balance simultaneously with a trip completion? The wallet update MUST use a
  row-level lock (`SELECT FOR UPDATE`) to prevent a read-modify-write race
  condition.
- What if the commission constants (7%, $1.00 service fee) are changed at the
  code level? They are named constants — changing them requires a deliberate
  constant update and the change is auditable in version control. In-flight
  trips use the rate at the time of completion.
- What if there is a fractional cent in the fare split? Both amounts are rounded
  to 2 decimal places. Rounding differences are absorbed by the merchant amount
  (the larger share).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST compute the final trip fare from the actual distance
  travelled at trip completion using the platform's base fare formula. The
  formula inputs and output MUST be deterministic — the same distance always
  yields the same fare.
- **FR-002**: On trip completion, system MUST atomically: update trip status to
  `completed`, compute `platformCommission = fare × 0.07`, compute
  `merchantAmount = fare × 0.93`, create a platform wallet ledger credit, and
  create a merchant wallet ledger credit — all in a single database transaction.
- **FR-003**: The commission rate (7%) and payout service fee ($1.00) MUST be
  stored as named constants, never as magic numbers in business logic.
- **FR-004**: No wallet balance update is permitted outside of a `ledgerEntry`
  record. Every credit and debit MUST have a corresponding ledger row with:
  amount, type (closed enum), reference ID (trip or payout), and timestamp.
- **FR-005**: Wallet balance mutations MUST acquire a row-level lock on the
  wallet record before reading the current balance, to prevent concurrent write
  races.
- **FR-006**: System MUST compute and return a fare estimate given a pickup and
  destination before any booking is created. The estimate MUST include an FJD
  total and distance component.
- **FR-007**: Merchants MUST be able to view their current wallet balance (live
  sum of all ledger entries) and a paginated ledger history.
- **FR-008**: Ledger entries MUST be immutable once created. No editing or
  deletion of a ledger entry is permitted.
- **FR-009**: Passengers MUST be able to view a detailed trip receipt (pickup,
  destination, distance, fare breakdown, total in FJD) for every completed trip
  in their history.
- **FR-010**: System MUST send an email receipt to the passenger on trip
  completion.
- **FR-011**: Fare amounts MUST always be displayed with the `FJD` currency
  label and two decimal places across all passenger-facing and merchant-facing
  surfaces.

### Key Entities

- **Wallet**: One record per merchant and one for the platform. Holds the
  current running balance, computed as the sum of all ledger entries. The
  balance field is updated as a materialised running total (with row-level
  locking) for O(1) balance reads.
- **LedgerEntry**: An immutable record of a single financial event. Holds wallet
  ID, amount (positive = credit, negative = debit), type (`trip_commission` |
  `trip_merchant_credit` | `payout_debit`), reference ID (trip or payout), and
  timestamp.
- **FareFormula**: The platform's pricing model — not a database entity, but a
  named-constant set in `@hakwa/core`. Phase 1: base fare + (rate per km ×
  distance).

### Assumptions

- In Phase 1, all transactions are post-trip (no pre-payment, no in-app card
  charging). The fare is settled to the merchant wallet at trip completion; cash
  or card payment at the vehicle is outside the platform's scope in Phase 1.
- Passenger-side wallet (for pre-loaded credit) is deferred to a future phase.
  Only merchant wallets and the platform wallet are in scope.
- Surge pricing, dynamic fares, and promotional discounts are deferred to a
  future phase. All Phase 1 fares use the base formula.
- Fare formula constants (base fare, per-km rate) are stored as named constants
  in `@hakwa/core` and can be updated via a code change. A config-driven admin
  UI for fare adjustment is a future phase feature.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of trip completions produce matching paired ledger entries
  (platform + merchant) summing exactly to the gross fare — zero discrepancies
  in end-to-end test suite.
- **SC-002**: Zero instances of a wallet balance update without a corresponding
  ledger entry, verified by database integrity constraint tests.
- **SC-003**: Fare estimate is returned to the passenger within 2 seconds of
  providing a valid pickup and destination.
- **SC-004**: Zero concurrent wallet balance corruption incidents under load
  testing with 50 simultaneous trip completions hitting the same merchant
  wallet.
- **SC-005**: Passengers can access a complete trip receipt within the app
  within 5 seconds of trip completion.

## User Scenarios & Testing _(mandatory)_

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g.,
"Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements _(mandatory)_

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create
  accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email
  addresses"]
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their
  password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

_Example of marking unclear requirements:_

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth
  method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention
  period not specified]

### Key Entities _(include if feature involves data)_

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria _(mandatory)_

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in
  under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users
  without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully
  complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by
  50%"]
