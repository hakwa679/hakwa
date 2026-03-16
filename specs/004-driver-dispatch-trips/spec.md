# Feature Specification: Driver Dispatch & Trips

**Feature Branch**: `004-driver-dispatch-trips`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: Driver-side dispatch flow: receiving booking requests, accepting or
declining, navigating to pickup, managing trip lifecycle states, and viewing
earnings history

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Go Online and Receive a Booking Request (Priority: P1)

A driver opens the Driver App, sets themselves to "Available" (online), and
waits. When a nearby passenger submits a booking, the driver receives a push
notification and an in-app alert with the pickup location, estimated distance to
pickup, and the fare estimate. The driver has a configurable window to accept or
decline before the request is automatically passed to the next driver.

**Why this priority**: Without drivers going online and receiving requests, no
trips can happen. This is the supply-side equivalent of the passenger booking
flow.

**Independent Test**: A driver with an approved account and a linked vehicle can
go online, receive a simulated booking request, see pickup details and fare
estimate, and confirm the alert is delivered — independently of any payment
processing.

**Acceptance Scenarios**:

1. **Given** a driver with an `active` merchant account and at least one
   vehicle, **When** they toggle "Go online" in the Driver App, **Then** their
   availability status is set to `available` and they appear in the dispatch
   pool.
2. **Given** an `available` driver, **When** a matching booking request is
   dispatched to them, **Then** they receive a push notification and an in-app
   booking request card showing: passenger pickup address, estimated distance to
   pickup, and estimated trip fare.
3. **Given** a booking request card visible, **When** the response window
   expires (configurable timeout, default 30 seconds) without the driver
   responding, **Then** the request is automatically passed to the next
   available driver and the card dismisses.
4. **Given** an `available` driver, **When** they tap "Go offline", **Then**
   their status is set to `offline` and they no longer receive booking requests.

---

### User Story 2 - Accept a Booking and Navigate to Pickup (Priority: P1)

The driver taps "Accept" on a booking request. The booking is confirmed, the
passenger is notified, and the driver's app shows the passenger's pickup
location with navigation cues. The driver marks "Arrived at pickup" when they
reach the passenger.

**Why this priority**: Completing the acceptance handshake is the first
committed action of a trip. It triggers all downstream real-time events and
locks the booking to this driver.

**Independent Test**: A driver can accept a booking, see the pickup destination,
and mark themselves as arrived — yielding a booking in `driver_arrived` state,
independently of trip completion and payment.

**Acceptance Scenarios**:

1. **Given** a booking request card, **When** the driver taps "Accept", **Then**
   the booking status transitions atomically from `pending` to `accepted`
   (preventing double-acceptance), the passenger is notified, and the driver's
   screen shows the pickup address.
2. **Given** an `accepted` booking, **When** another driver attempts to accept
   the same booking (race condition), **Then** the second accept is rejected
   with a `409 Conflict` and the second driver sees "Booking no longer
   available".
3. **Given** the driver has navigated to the pickup location, **When** they tap
   "I've arrived", **Then** the booking status transitions to `driver_arrived`
   and the passenger receives an arrival notification.

---

### User Story 3 - Start and Complete a Trip (Priority: P1)

The driver confirms the passenger is in the vehicle and taps "Start trip". The
trip begins. The driver navigates to the destination and taps "Complete trip" on
arrival. The fare is finalised, the commission split is calculated, and both the
platform and merchant wallets are credited.

**Why this priority**: Trip completion is the moment revenue is generated. The
fare split and wallet credits must happen atomically at this point.

**Independent Test**: A driver can progress a booking from `driver_arrived` →
`in_progress` → `completed`, triggering the fare split, independently of the
gamification and notification side effects.

**Acceptance Scenarios**:

1. **Given** a booking in `driver_arrived` state, **When** the driver taps
   "Start trip", **Then** the booking transitions to `in_progress`, a `Trip`
   record is created with a start timestamp, and the passenger's screen shows
   live route tracking.
2. **Given** an `in_progress` trip, **When** the driver taps "Complete trip",
   **Then** the trip transitions to `completed`, the final fare is calculated
   from actual distance, and the fare split (7% platform / 93% merchant) is
   computed and written as ledger entries in the same transaction as the status
   update.
3. **Given** a completed trip, **When** the driver views the earnings summary,
   **Then** they see the trip listed with the gross fare and their net earnings
   (93% share).

---

### User Story 4 - Decline or Ignore a Booking Request (Priority: P2)

A driver who receives a booking request but is not in a good position to accept
it taps "Decline" or lets the request time out. The request is forwarded to the
next available driver. The declining driver's status remains `available`.

**Why this priority**: Drivers must be able to manage their availability without
being penalised by errant accepts.

**Independent Test**: A driver can decline a booking request and remain in the
`available` pool to receive subsequent requests.

**Acceptance Scenarios**:

1. **Given** a booking request card, **When** the driver taps "Decline",
   **Then** the request is forwarded to the next available driver and the driver
   remains `available`.
2. **Given** a booking request that automatically expires without action,
   **When** the timeout elapses, **Then** the request is forwarded and the
   driver remains `available` (no penalty in Phase 1 — excessive non-response
   policy is a future phase feature).

---

### User Story 5 - View Earnings History (Priority: P3)

A driver wants to see how much they have earned. They navigate to the Earnings
tab in the Driver App and see a list of completed trips with dates,
destinations, and their net earnings per trip.

**Why this priority**: Earnings visibility is a retention driver — operators
need to see the value of staying on the platform.

**Independent Test**: A driver with completed trips can navigate to Earnings and
see trip-level net earnings.

**Acceptance Scenarios**:

1. **Given** a driver with at least one completed trip, **When** they open the
   Earnings tab, **Then** trips are listed in reverse-chronological order
   showing destination, date, gross fare, and net earnings.
2. **Given** the Earnings tab, **When** the driver views the current week's
   total, **Then** the aggregate net earnings for the week are clearly
   displayed.

---

### Edge Cases

- What if two drivers accept the same booking simultaneously? The conditional
  status update (`WHERE status = 'pending'`) ensures only one succeeds; the
  other receives a conflict response and the booking card is dismissed from
  their screen.
- What if the driver loses connectivity while a trip is `in_progress`? The app
  retains the last known state. Status change actions (complete trip) are queued
  and submitted when connectivity is restored.
- What if the driver marks "Arrived" before actually reaching the pickup? The
  system cannot enforce physical accuracy; this is a policy/UX concern. The
  driver is reminded that the passenger will be notified immediately.
- What if a driver goes offline mid-trip? The trip continues in `in_progress`.
  Going offline only affects the availability for new bookings.
- What if the driver attempts to complete a trip that is not in `in_progress`
  state (e.g., stale screen)? The update is rejected with a clear "This trip is
  no longer in the expected state" message.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST allow a driver with an `active` merchant account and
  at least one vehicle to toggle their availability online (`available`) or
  offline (`offline`).
- **FR-002**: System MUST dispatch pending booking requests to `available`
  drivers based on proximity to the pickup location.
- **FR-003**: Each booking request dispatched to a driver MUST include:
  passenger pickup address, estimated distance from driver to pickup, and
  estimated trip fare.
- **FR-004**: The driver MUST have a configurable acceptance window (default 30
  seconds) to respond to each booking request. Expiry MUST automatically pass
  the request to the next driver.
- **FR-005**: Accepting a booking MUST use a conditional update
  (`status = 'pending'`) to prevent double-acceptance. A concurrent accept MUST
  return a `409 Conflict` to the second driver.
- **FR-006**: On acceptance, the booking status MUST transition to `accepted`,
  the passenger MUST be notified in real time, and the driver's screen MUST show
  the passenger's pickup address.
- **FR-007**: Driver MUST be able to mark arrival at pickup ("I've arrived"),
  transitioning the booking to `driver_arrived` and notifying the passenger.
- **FR-008**: Driver MUST be able to start the trip from `driver_arrived` state,
  transitioning to `in_progress` and capturing a start timestamp.
- **FR-009**: Driver MUST be able to complete the trip from `in_progress` state.
  Completion MUST trigger: final fare calculation from actual distance,
  fare-split ledger entries (7% platform / 93% merchant), and a trip receipt for
  the passenger — all in a single atomic database transaction.
- **FR-010**: Driver's GPS position MUST be continuously streamed to the
  platform while the driver is `available` or has an active trip, so passengers
  can track the driver in real time.
- **FR-011**: Driver MUST be able to view their earnings history: completed
  trips in reverse-chronological order with gross fare, net earnings, and the
  current week's aggregate.
- **FR-012**: Driver MUST receive push and in-app notifications for: new booking
  request, booking accepted (confirmation), passenger ready (after
  `driver_arrived`), and trip completed.
- **FR-013**: System MUST NOT allow a trip status to regress (e.g., from
  `in_progress` back to `accepted`). All status changes are forward-only.

### Key Entities

- **Driver Availability**: The current online/offline status of a driver.
  Governs whether they appear in the dispatch pool.
- **Booking** (shared with Passenger spec): The lifecycle record transitioning
  through
  `pending → accepted → driver_arrived → in_progress → completed | cancelled`.
- **Trip**: The formal record of a completed or in-progress journey. Holds
  driver ID, vehicle ID, passenger ID, actual start/end times, actual distance,
  final fare, and links to ledger entries.
- **DriverLocation**: The real-time GPS coordinate of an actively connected
  driver. Consumed by the dispatch engine and by passenger tracking.

### Assumptions

- Drivers are employees or agents of a merchant (fleet owner). A driver logs in
  with their own driver account, not the merchant account.
- Vehicle selection at trip start: in Phase 1 a driver has exactly one active
  vehicle assigned. Multi-vehicle selection is deferred.
- Navigation integration (turn-by-turn instructions) is not provided by Hakwa in
  Phase 1; the driver uses their preferred external maps app.
- Driver rating by passengers is collected at trip end but the rating
  aggregation and display are deferred to a post-MVP phase.
- Cancellation by the driver after accepting is permitted in Phase 1 without
  penalty; driver cancellation policy enforcement is a future phase feature.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Booking request notification reaches a nearby `available` driver
  within 3 seconds of the passenger confirming the booking.
- **SC-002**: Double-acceptance (two drivers accepting the same booking) never
  results in two `accepted` records — validated by concurrent acceptance stress
  tests.
- **SC-003**: Trip `completed` event triggers fare-split ledger entries in the
  same database transaction, confirmed by zero split-missing discrepancies in
  automated tests.
- **SC-004**: Driver GPS position updates are received by the passenger tracking
  screen within 10 seconds of the driver's device emitting a location update,
  under normal connectivity.
- **SC-005**: A driver can complete the full workflow (go online → accept →
  arrive → start → complete) in under 5 minutes of simulated elapsed time in
  end-to-end tests.
