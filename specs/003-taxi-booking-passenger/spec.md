# Feature Specification: Taxi Booking — Passenger

**Feature Branch**: `003-taxi-booking-passenger`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: Taxi booking flow for passengers: requesting a ride, real-time driver
matching, live trip tracking, fare estimate display, and booking cancellation

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Request a Taxi Ride (Priority: P1)

A passenger opens the Rider App, sets their pickup location (auto-detected or
manually entered) and destination, sees a fare estimate, and taps "Book ride".
The booking is created and the passenger waits on a screen showing the search
for a nearby available driver.

**Why this priority**: This is the core revenue-generating action on the
platform. All other passenger-side features support or follow from this one.

**Independent Test**: A verified passenger can submit a booking request with
pickup and destination, receive a fare estimate before confirming, and reach the
"searching for driver" state — delivering the primary booking entry point
independently.

**Acceptance Scenarios**:

1. **Given** an authenticated passenger on the booking screen, **When** they tap
   their current location or type a pickup address and set a destination,
   **Then** a fare estimate is displayed before any booking is created.
2. **Given** a fare estimate visible, **When** the passenger taps "Book ride",
   **Then** a booking record is created with status `pending` and the passenger
   sees a "Searching for driver" screen.
3. **Given** a `pending` booking, **When** a driver accepts it, **Then** the
   passenger's screen transitions in real time to "Driver found" showing the
   driver's name, vehicle details, and estimated arrival time.
4. **Given** no available drivers within the service area, **When** the search
   times out after the configured wait period, **Then** the booking is cancelled
   automatically and the passenger is shown a clear "No drivers available — try
   again shortly" message.

---

### User Story 2 - Live Trip Tracking (Priority: P1)

Once a driver has accepted a booking, the passenger sees the driver's location
on a map updating in real time. Status updates (driver en route → driver arrived
→ trip in progress → trip completed) appear as prominent banners without the
passenger needing to refresh or navigate away.

**Why this priority**: Real-time status visibility is a primary trust signal.
Without it, passengers are anxious and support requests spike.

**Independent Test**: A passenger with an accepted booking can see the driver's
live location on a map and observe status transitions automatically,
independently of any payment flow.

**Acceptance Scenarios**:

1. **Given** a booking in `accepted` state, **When** the driver starts moving
   toward the pickup, **Then** the driver's position updates on the passenger's
   map at least every 5 seconds.
2. **Given** an `accepted` booking, **When** the driver marks themselves as
   arrived, **Then** the passenger's screen shows a "Your driver has arrived"
   banner with a sound/vibration alert.
3. **Given** a `driver_arrived` booking, **When** the driver starts the trip,
   **Then** the status transitions to `in_progress` and the passenger's screen
   shows the live route to the destination.
4. **Given** an `in_progress` trip, **When** the driver marks the trip as
   completed at the destination, **Then** the passenger's screen transitions to
   a trip summary showing the final fare and a rating prompt.

---

### User Story 3 - View Fare Estimate Breakdown (Priority: P2)

Before confirming a booking, the passenger can see a fare breakdown (base fare
plus distance component) and understand what they will be charged. The displayed
estimate matches the charged fare unless surge pricing applies (in which case
the passenger is clearly notified).

**Why this priority**: Transparent pricing builds trust and reduces post-trip
disputes. Required for the constitution's "trust through transparency"
principle.

**Independent Test**: A passenger on the booking screen can see a fare estimate
with a breakdown before any booking is created.

**Acceptance Scenarios**:

1. **Given** a pickup and destination entered, **When** the fare estimate is
   displayed, **Then** it shows at least: the estimated total in FJD, and the
   distance component.
2. **Given** a confirmed fare estimate, **When** the trip is completed and
   charged, **Then** the final charged fare matches the estimate (within an
   acceptable distance variance for route deviations). Any discrepancy MUST be
   explained on the receipt.

---

### User Story 4 - Cancel a Booking (Priority: P2)

A passenger who has booked but the driver has not yet arrived can cancel the
booking. Cancellations within a grace period are penalty-free. The passenger
returns to the booking home screen.

**Why this priority**: Passengers change their minds. A clear, penalty-aware
cancellation flow prevents disputes.

**Independent Test**: A `pending` or `accepted` booking can be cancelled before
status reaches `in_progress` and the passenger is returned to the home screen.

**Acceptance Scenarios**:

1. **Given** a `pending` booking, **When** the passenger taps "Cancel booking",
   **Then** a confirmation dialog explains any consequences ("Cancel trip to
   Suva CBD?") and the passenger confirms, the booking is cancelled, and they
   return to the home screen.
2. **Given** an `accepted` booking within the grace period (default 30 seconds
   from acceptance), **When** the passenger cancels, **Then** the cancellation
   is penalty-free and the driver is notified.
3. **Given** an `accepted` booking outside the grace period, **When** the
   passenger cancels, **Then** the platform applies the configured cancellation
   policy (displayed in the confirmation dialog before the passenger confirms).
4. **Given** an `in_progress` trip, **When** the passenger views the trip
   screen, **Then** the cancel option is not available.

---

### User Story 5 - View Trip History (Priority: P3)

A passenger wants to review their past trips. They navigate to the History tab
and see a list of completed and cancelled trips with dates, routes, and final
fares. Tapping a trip shows its receipt.

**Why this priority**: Trip history is a common support and self-service need.
Reduces "what was I charged?" support queries.

**Independent Test**: A passenger with at least one completed trip can navigate
to History and see the trip with its fare.

**Acceptance Scenarios**:

1. **Given** an authenticated passenger with completed trips, **When** they open
   the History tab, **Then** trips are listed in reverse-chronological order
   with destination, date, and fare amount.
2. **Given** a trip in the history list, **When** the passenger taps it,
   **Then** a receipt view shows: pickup address, destination, distance, fare
   breakdown, and driver name.

---

### Edge Cases

- What if the passenger loses internet connectivity during an active trip? The
  last-known driver location is displayed with a clear "You're offline" banner.
  The trip status updates automatically when connectivity is restored.
- What if the driver's GPS signal is lost during tracking? The passenger sees
  the last known position with a "Updating location…" indicator.
- What if the fare estimate changes significantly (>10%) between estimation and
  trip completion due to a different route? The final receipt shows both the
  estimate and actual fare with an explanation.
- What if the passenger taps "Book ride" twice rapidly? The system MUST be
  idempotent — only one booking is created.
- What if there are no drivers in the service area at all? The system shows "No
  drivers available right now" rather than showing a spinner indefinitely.
- What if a booking is accepted but the driver cancels before arrival? The
  passenger is notified immediately (push + in-app), the booking returns to
  `pending` status and re-enters the search pool, or the passenger is prompted
  to rebook.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST allow a verified passenger to request a taxi ride by
  providing a pickup location and a destination.
- **FR-002**: System MUST display a fare estimate (total in FJD with a distance
  component breakdown) before the passenger confirms a booking.
- **FR-003**: System MUST create a booking record in `pending` state upon
  passenger confirmation and begin searching for an available driver.
- **FR-004**: If no driver accepts within the configured timeout period, the
  system MUST automatically cancel the booking and notify the passenger.
- **FR-005**: Once a driver accepts, the booking status MUST transition to
  `accepted` and the passenger MUST receive an in-app and push notification
  showing driver name, vehicle details, and estimated arrival time.
- **FR-006**: Driver location MUST be streamed to the passenger in real time (at
  least every 5 seconds) from acceptance through trip completion.
- **FR-007**: Trip status transitions (accepted → driver_arrived → in_progress →
  completed) MUST be reflected on the passenger's screen automatically via the
  real-time channel — no manual refresh required.
- **FR-008**: System MUST allow a passenger to cancel a `pending` or `accepted`
  booking before the trip reaches `in_progress`. Cancellation during the grace
  period MUST be penalty-free.
- **FR-009**: Cancellation confirmation dialogs MUST name the specific
  destination and describe any applicable cancellation fee in plain language
  before the passenger confirms.
- **FR-010**: System MUST prevent a passenger from cancelling an `in_progress`
  trip via the standard cancellation flow.
- **FR-011**: Booking creation MUST be idempotent — duplicate submissions within
  a short window MUST NOT create two bookings.
- **FR-012**: System MUST display a complete trip receipt on completion: pickup,
  destination, distance, fare breakdown (base + distance), and driver name.
- **FR-013**: Passengers MUST be able to view their trip history in
  reverse-chronological order, with each trip's date, destination, fare and a
  tappable detail/receipt view.
- **FR-014**: The booking home screen MUST show any active booking's current
  status prominently without requiring navigation.

### Key Entities

- **Booking**: The intent record created when a passenger requests a ride. Holds
  passenger ID, pickup coordinates and address, destination coordinates and
  address, status (`pending` | `accepted` | `driver_arrived` | `in_progress` |
  `completed` | `cancelled`), fare estimate, and timestamps.
- **Trip**: The operational record created when a driver accepts a booking and
  starts the journey. Holds driver ID, vehicle ID, merchant ID, start/end
  timestamps, actual distance, final fare, and status.
- **DriverLocation**: The real-time position record for active drivers. Updated
  frequently and consumed by the tracking screen.
- **FareEstimate**: A computed value (not persisted independently) derived from
  pickup-to-destination distance using the platform fare formula.

### Assumptions

- In-app payment (wallet, card) is out of scope for this spec; it is covered by
  the Wallet & Fare spec. This spec covers the booking lifecycle only; fare
  collection and commission split are handled post-completion.
- Surge pricing is a future-phase feature. All estimates in Phase 1 use the base
  fare formula only.
- Ride scheduling (booking for a future time) is deferred to a future phase; all
  bookings are immediate.
- Driver rating is collected post-trip but the rating submission flow is
  deferred to the Driver Dispatch spec.
- Only taxi (full-vehicle) booking is in scope. Seat-level booking for
  minibus/bus is Phase 2.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A passenger can go from opening the app to having a confirmed
  booking (driver accepted) in under 90 seconds on a mid-range Android device
  with a stable connection.
- **SC-002**: Fare estimates are displayed within 2 seconds of the passenger
  entering a valid destination.
- **SC-003**: Driver location updates on the tracking screen with no more than
  10 seconds of lag from GPS signal under normal connectivity.
- **SC-004**: 100% of status transitions (accepted, arrived, in-progress,
  completed) are reflected on the passenger screen without a manual refresh.
- **SC-005**: Booking idempotency — zero duplicate bookings created across all
  automated double-submit tests.
- **SC-006**: Trip cancellation within the grace period results in zero charges,
  100% of the time.
