# Feature Specification: Merchant Onboarding

**Feature Branch**: `002-merchant-onboarding`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: Merchant onboarding flow for both licensed and unlicensed merchants,
including business verification, fleet registration, bank account setup for
payouts, and profile completion

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Licensed Merchant Completes Onboarding (Priority: P1)

A taxi company owner who holds a valid LTA business registration opens the
Merchant App after registering. They are walked through a step-by-step
onboarding wizard that collects their business name, TIN, LTA business
registration number, a bank account for payouts, and their first vehicle. On
completion they reach the merchant dashboard in an "under review" state, and
Hakwa staff are notified to verify the submitted documents.

**Why this priority**: Licensed merchants form the core regulated supply side.
Without at least one licensed merchant onboarded, the platform has no compliant
supply.

**Independent Test**: A merchant account holder with the `licensed` licensing
tier can complete all onboarding steps and reach the dashboard in "under review"
state, independently of any pending admin review workflow.

**Acceptance Scenarios**:

1. **Given** a verified merchant account with `licenseType = licensed`, **When**
   they open the app post-verification, **Then** the onboarding wizard launches
   automatically with a clear progress indicator showing all required steps.
2. **Given** the business details step, **When** the merchant submits their
   business name, TIN, and LTA registration number, **Then** the data is saved
   and the merchant advances to the next step.
3. **Given** the bank account step, **When** the merchant submits their bank
   name, account number, and account holder name, **Then** the bank account is
   saved as the payout destination.
4. **Given** the vehicle registration step, **When** the merchant adds a vehicle
   with make, model, year, registration plate, and seating capacity, **Then**
   the vehicle record is created linked to the merchant.
5. **Given** all required steps completed, **When** the merchant taps "Submit
   for review", **Then** the merchant profile status transitions to
   `under_review` and they are routed to the dashboard with a clear status
   banner.

---

### User Story 2 - Unlicensed Merchant Completes Onboarding (Priority: P1)

An individual taxi driver without a formal business entity opens the Merchant
App after registering. They go through a lighter onboarding wizard — only their
identity information (full name, national ID number, phone number) and their
vehicle are required. No TIN or LTA registration number is collected. On
completion they reach the dashboard in "under review" state.

**Why this priority**: Unlicensed merchants represent the broader informal
market in Fiji. Omitting this flow immediately after the licensed flow ensures
both tiers are serviceable at launch.

**Independent Test**: A merchant account with `licenseType = unlicensed` can
complete the lighter onboarding (no business documents) and reach the dashboard.

**Acceptance Scenarios**:

1. **Given** a verified merchant account with `licenseType = unlicensed`,
   **When** they open the app post-verification, **Then** the onboarding wizard
   launches with only the steps relevant to unlicensed merchants (no TIN or LTA
   registration fields are shown).
2. **Given** the identity step, **When** the merchant submits their full name
   and national ID number, **Then** the data is saved and they advance to
   vehicle registration.
3. **Given** a completed unlicensed onboarding, **When** the merchant submits,
   **Then** the status is set to `under_review` and they are routed to the
   dashboard.

---

### User Story 3 - Merchant Updates Onboarding Details Before Approval (Priority: P2)

A merchant who has submitted their onboarding but not yet been approved realises
they entered an incorrect bank account number. They navigate to their profile
settings and update the bank account details. The update is reflected
immediately; the review status remains `under_review`.

**Why this priority**: Data entry errors are inevitable. Blocking corrections
until after approval creates unnecessary support tickets.

**Independent Test**: An `under_review` merchant can edit and save their bank
account details from the profile screen.

**Acceptance Scenarios**:

1. **Given** an `under_review` merchant, **When** they navigate to Settings →
   Payout Account, **Then** they see their current bank account details with an
   "Edit" option.
2. **Given** the edit payout account screen, **When** they submit updated
   account details, **Then** the new details are saved and confirmed on-screen.

---

### User Story 4 - Adding Additional Vehicles After Approval (Priority: P3)

A licensed merchant whose account is `active` wants to expand their fleet. They
navigate to the Fleet section of the Merchant App, add a second vehicle with its
details, and it appears in their fleet list immediately.

**Why this priority**: Fleet management is ongoing; merchants must be able to
grow without admin intervention for each vehicle.

**Independent Test**: An approved (`active`) merchant can add a vehicle and see
it listed in their fleet.

**Acceptance Scenarios**:

1. **Given** an `active` merchant, **When** they tap "Add vehicle" and complete
   the vehicle form, **Then** a new vehicle record is created and appears in the
   fleet list.
2. **Given** a duplicate registration plate, **When** the merchant submits,
   **Then** the system rejects the submission with a clear message that this
   plate is already registered.

---

### Edge Cases

- What if a merchant submits onboarding with a TIN that is already registered to
  another merchant? The system rejects the submission with a message to contact
  support.
- What if the bank account number format is invalid for any Fijian bank? The
  system shows an inline validation error before submission.
- What if a merchant's account is rejected after the "under review" period? The
  merchant receives a notification with the reason and a link to re-submit
  corrected information. The review cycle restarts.
- What if a merchant attempts to add a vehicle whose registration plate is
  already listed under another merchant? The system rejects the addition and
  surfaces a conflict message.
- What if the merchant skips or closes the onboarding wizard mid-flow? Their
  progress is saved. On next app open, the wizard resumes at the last incomplete
  step.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST present a role-aware onboarding wizard to any merchant
  account that has completed email verification but not yet completed
  onboarding.
- **FR-002**: The onboarding wizard MUST present different steps based on the
  merchant's `licenseType`: licensed merchants see business details (business
  name, TIN, LTA registration number) steps; unlicensed merchants see only
  identity details (full name, national ID number) steps.
- **FR-003**: Both licensing tiers MUST complete a bank account step (bank name,
  account number, account holder name) as part of onboarding.
- **FR-004**: Both licensing tiers MUST register at least one vehicle (make,
  model, year, registration plate, seating capacity) before they can submit for
  review.
- **FR-005**: The wizard MUST persist partial progress: if the merchant leaves
  mid-flow, the completed steps MUST be restored when they return.
- **FR-006**: On wizard completion, the merchant's `onboardingStatus` MUST
  transition to `under_review`. The merchant is routed to the dashboard showing
  a clear "Under review" status banner with an explanation of next steps.
- **FR-007**: The merchant dashboard MUST surface the `onboardingStatus`
  prominently: `incomplete`, `under_review`, `active`, or `rejected`. A
  `rejected` status MUST include the reason provided by the reviewer.
- **FR-008**: An `active` merchant MUST be able to add additional vehicles to
  their fleet at any time through the Fleet section.
- **FR-009**: Vehicle registration plates MUST be unique across the entire
  platform. Duplicate plate submissions MUST be rejected with a clear error.
- **FR-010**: TIN numbers MUST be unique per merchant account. A TIN already
  associated with another merchant MUST be rejected.
- **FR-011**: A merchant MUST be able to edit their payout bank account details
  at any time. Changes take effect for the next payout cycle.
- **FR-012**: The onboarding wizard MUST show a clear progress indicator (e.g.,
  "Step 2 of 4") so merchants know how much remains.
- **FR-013**: System MUST notify the merchant via in-app notification and email
  when their account status changes (approved, rejected).

### Key Entities

- **Merchant**: The merchant profile linked to a user account. Holds
  `licenseType` (`licensed` | `unlicensed`), `onboardingStatus` (`incomplete` |
  `under_review` | `active` | `rejected`), identity/business credentials, and a
  reference to their payout bank account.
- **Vehicle**: A vehicle owned by a merchant. Holds make, model, year,
  registration plate, seating capacity, and active status. A merchant may own
  multiple vehicles.
- **PayoutBankAccount**: The merchant's designated bank account for weekly
  payout sweeps. Holds bank name, account number, account holder name, and the
  effective-from date for the current details.

### Assumptions

- Admin-side review and approval of merchant applications is out of scope for
  this spec (covered by a future Admin Portal spec). This spec covers only what
  the merchant experiences.
- Document upload (photos of ID, LTA certificate) is deferred to a future phase.
  Initial onboarding relies on self-reported data with admin manual
  verification.
- A merchant may only have one active payout bank account at a time. Multiple
  accounts or account history are out of scope.
- Driver accounts who are also sole operators (single-vehicle) register as
  merchants, not as drivers. A driver account is distinct from a merchant
  account (see User Registration spec).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A licensed merchant can complete the full onboarding wizard,
  verified end-to-end, in under 10 minutes on a mid-range Android device.
- **SC-002**: An unlicensed merchant can complete their lighter onboarding
  wizard in under 6 minutes.
- **SC-003**: 100% of merchant submissions correctly differentiate between
  licensed and unlicensed fields — no licensed merchant is shown fields intended
  only for unlicensed merchants, and vice versa.
- **SC-004**: Mid-flow abandonment recovery rate: merchants who return after
  abandoning mid-wizard resume from the correct last-completed step in ≥ 99% of
  cases.
- **SC-005**: Duplicate registration plate and TIN submissions are rejected 100%
  of the time before the record is persisted.
