# Feature Specification: Rider & Driver Safety System

**Feature Branch**: `010-safety-system`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: A seamless, always-available safety layer for both passengers and
drivers covering in-trip SOS, live trip sharing with trusted contacts, vehicle
verification, anomaly-triggered check-ins, and post-trip incident reporting. The
system must be fast to activate, hard to trigger accidentally, and effective
even when the user cannot openly interact with their phone.

---

## Background & Safety Design Philosophy

Safety must be invisible until it is needed, then immediate. Four principles
guide every design decision in this feature:

1. **Zero friction on the critical path.** An SOS that requires three taps
   through menus is useless in a moment of panic. Every primary safety action
   MUST be reachable in ≤ 2 taps from the active-trip screen, or via a physical
   gesture that works with the screen locked.

2. **Silent-mode capability.** A passenger who feels threatened by a driver
   cannot obviously reach for their phone and trigger an alert. The system MUST
   provide a covert activation path — an inconspicuous gesture, a disguised
   "call mum" shortcut — that the driver cannot easily recognise as an SOS.

3. **Layered defence, not a single button.** The SOS button is the last resort.
   Before it is needed, the system provides preventive layers: vehicle
   verification before boarding, live trip sharing before departure, automated
   route-deviation monitoring during the trip. Each layer reduces the situations
   that reach the SOS stage.

4. **Driver safety is equal.** Drivers face their own risks — difficult
   passengers, cash robberies, medical emergencies. Every safety primitive (SOS,
   emergency contacts, incident reporting) is symmetric: available to both roles
   with appropriate framing.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Trigger an SOS During an Active Trip (Priority: P1)

A passenger who feels unsafe during a trip — wrong vehicle, threatening
behaviour, or genuine emergency — long-presses the shield icon on the
active-trip screen for 2 seconds (preventing accidental triggers). A 5-second
countdown with a "Cancel" option appears. If uncancelled, the SOS fires: the
passenger's registered emergency contacts receive an SMS containing the driver's
name, vehicle plate, and a live-tracking link; the platform's safety queue
receives an alert with the passenger's last known GPS coordinate; and a safety
card slides up on screen showing Fiji's emergency numbers (Ambulance: 911,
Police: 917, Fire: 910). A silent SOS variant (three rapid volume-button
presses, screen on or off) triggers the same pipeline without any visible
on-screen change.

**Why this priority**: SOS is the floor of the entire safety system. If someone
is in danger, this is the feature that could save their life. It must work
before any other safety feature is built.

**Independent Test**: An authenticated passenger with an active trip and at
least one registered emergency contact can trigger an SOS (using the non-silent
path), observe the 5-second countdown, let it expire, and confirm: a
`safetyIncident` row exists with `type = "sos"` and `status = "active"`, an SMS
notification was queued for the emergency contact, and a `safety.sos_triggered`
WebSocket event was emitted to the safety-team channel — independently of any
anomaly, check-in, or incident-report system.

**Acceptance Scenarios**:

1. **Given** a passenger with an active trip and at least one emergency contact,
   **When** they long-press the shield icon for 2 seconds, **Then** a 5-second
   cancellable countdown overlay appears with a clear "Cancel" button.
2. **Given** the countdown is not cancelled, **When** it reaches zero, **Then**:
   a `safetyIncident` row is created (`type = "sos"`, `status = "active"`,
   `reporterId = passenger.id`, `tripId`, `locationSnapshotJson = current GPS`);
   an SMS is dispatched to each active emergency contact containing the driver's
   name, vehicle plate, and a live-share link; and the safety-card renders on
   screen with Fiji emergency numbers.
3. **Given** a passenger who pressed hold accidentally, **When** they tap
   "Cancel" during the countdown, **Then** no `safetyIncident` row is created
   and the screen returns to normal.
4. **Given** a passenger with the screen locked, **When** they press the
   volume-up button three times in under 2 seconds, **Then** the silent SOS
   fires immediately (no countdown, no visible feedback beyond a brief
   vibration), creating the same `safetyIncident` row and dispatching the same
   SMS — no on-screen change that a driver could observe.
5. **Given** an SOS is active, **When** the platform safety team acknowledges it
   (via admin dashboard), **Then** the `safetyIncident` status transitions to
   `"acknowledged"` and the passenger receives an in-app notification: _"A
   safety agent has been alerted and is monitoring your trip."_
6. **Given** a driver who triggers an SOS (symmetric path — same long-press on
   their active-trip screen), **When** the SOS fires, **Then** the same pipeline
   runs with the roles reversed: the driver's emergency contacts are notified
   and the safety queue receives the driver's location, passenger name, and
   booking ID.

---

### User Story 2 — Share a Live Trip with a Trusted Contact (Priority: P1)

Before or during a trip a passenger generates a live-share link from the
active-trip screen (tap the share icon in the trip card). The link opens in any
browser without sign-in: it shows the driver's first name, photo, vehicle make,
colour, and plate, the passenger's live GPS dot, the estimated route, and a
countdown to arrival. The link remains live until 15 minutes after the trip
ends, then expires. No app download is required for the viewer.

**Why this priority**: Trip sharing is the most commonly used safety feature in
production rideshare apps. It prevents many emergencies by giving a trusted
third party visibility into every trip — the driver knows someone is watching.

**Independent Test**: A passenger with an active booking can call
`POST /safety/trips/:tripId/share` to receive a share token, open
`GET /safety/share/:token` (unauthenticated), and receive trip details including
driver name, vehicle plate, and booking status — independently of SOS, contacts,
and anomaly detection.

**Acceptance Scenarios**:

1. **Given** a booking in `accepted`, `driver_arrived`, or `in_progress` status,
   **When** the passenger taps the share icon and confirms, **Then** a
   `tripShare` row is created with a cryptographically random, URL-safe token
   (min 128 bits), an `expiresAt` of `trip.completedAt + 15 min` (estimated if
   not yet complete), and a short shareable URL is shown with a copy button.
2. **Given** a share link opened in a browser, **When** the route is hit with a
   valid token, **Then** the response includes: driver first name, photo URL,
   vehicle make, colour, plate, booking status, passenger's last GPS coordinate
   (updated ≤ 5s), and ETA — with no authentication required.
3. **Given** a trip that has completed, **When** 15 minutes elapses after
   `trip.completedAt`, **Then** the `tripShare` row is marked `expired` and the
   share link returns `410 Gone` with a message: _"This tracking link has
   expired. The trip ended safely."_
4. **Given** a passenger who shares their link, **When** a viewer opens it,
   **Then** the viewer sees a live-updating map pinging every 5 seconds —
   delivered via server-sent events (SSE) — without installing the app.
5. **Given** a passenger who wants to revoke a share, **When** they tap "Stop
   sharing" in the trip card, **Then** the `tripShare` row is marked `revoked`
   and any active SSE connection is closed; subsequent requests to the share URL
   return `410 Gone`.
6. **Given** a passenger who has not yet shared, **When** a route deviation is
   detected server-side, **Then** the app prompts: _"Unusual route detected.
   Share your trip with someone you trust?"_ with a one-tap share shortcut.

---

### User Story 3 — Verify the Vehicle Before Boarding (Priority: P1)

When a driver is en route or has arrived, the passenger's screen shows a
**4-digit safety code** prominently beneath the driver card. The driver's app
shows the same code on their active-trip screen. The passenger verbally or
visually confirms the code matches before getting in. This prevents boarding the
wrong vehicle. As a complementary check, the passenger can tap "Verify plate" to
see the expected plate displayed at full-screen size for easy comparison from a
distance.

**Why this priority**: Wrong-vehicle boarding — whether accidental or predatory
— is the most common safety failure mode in new markets. This is a purely
informational feature that requires no server round-trip and can be shipped with
near-zero engineering effort once the booking flow exists.

**Independent Test**: A booking in `accepted` or `driver_arrived` state exposes
a `/safety/trips/:tripId/verify` endpoint that returns the safety code and
vehicle plate, computable deterministically from the booking ID and a secret —
independently of SOS, sharing, or anomaly systems.

**Acceptance Scenarios**:

1. **Given** a booking that transitions to `accepted`, **When** the passenger
   views the driver card, **Then** a 4-digit safety code is displayed
   prominently with the prompt _"Ask your driver to confirm: [CODE]"_.
2. **Given** the driver's app with an `accepted` booking, **When** the driver
   views the active-trip screen, **Then** the same 4-digit code is shown to the
   driver so they can confirm it verbally.
3. **Given** the same code shown on both screens, **When** the code is derived,
   **Then** it is a deterministic HMAC-based code:
   `HMAC-SHA256(bookingId + tripDate, SAFETY_CODE_SECRET)[:4 decimal digits]` —
   rotation every 24 hours ensures a code is never reusable across days.
4. **Given** a passenger who taps "Verify plate", **When** the full-screen
   overlay opens, **Then** the vehicle plate, make, model, and colour are shown
   at maximum size with a "Confirm it matches" checkbox; the passenger's
   confirmation status is recorded (optional, for safety audit log).
5. **Given** a passenger who selects "Wrong vehicle/driver", **When** they
   confirm, **Then** a `safetyIncident` row is created with
   `type = "wrong_vehicle"`, the booking is flagged for review, and the
   passenger is prompted to stay where they are and not board.

---

### User Story 4 — Manage Emergency Contacts (Priority: P1)

A passenger or driver can add up to 3 emergency contacts in their profile
settings. Each contact has a name, phone number, and optional label (e.g.,
"Mum", "Husband"). When an SOS fires, all active contacts for that user receive
an SMS. Contacts do not need a Hakwa account.

**Why this priority**: Without contacts configured, the SOS feature cannot
notify anyone. Contacts are the notification recipients — they must be set up
before an emergency. P1 because SOS is P1 and depends on this.

**Independent Test**: A user can call `POST /safety/contacts` to add a contact
with a name and valid Fiji mobile number, then `GET /safety/contacts` to see the
list — independently of SOS or trip-sharing.

**Acceptance Scenarios**:

1. **Given** an authenticated user on the safety settings screen, **When** they
   add a contact with name and phone number, **Then** a `safetyContact` row is
   created, the phone number is stored in normalised E.164 format, and the
   contact appears in their contacts list.
2. **Given** a user with 3 existing contacts, **When** they attempt to add a
   fourth, **Then** the request is rejected with `SAFETY_CONTACT_LIMIT_REACHED`
   and no new row is created.
3. **Given** a user with no emergency contacts, **When** they first open the
   Rider or Driver App after activation, **Then** a one-time nudge card prompts:
   _"Add an emergency contact for safer trips"_ with a shortcut to the settings
   screen. This nudge appears at most once.
4. **Given** a user on the safety settings screen, **When** they delete an
   emergency contact, **Then** the `safetyContact` row is deleted and the
   contact is removed from all future SOS dispatches (existing/active incidents
   already in flight are unaffected).
5. **Given** a user with contacts, **When** they trigger a test alert tap "Send
   Test Alert", **Then** each contact receives an SMS: _"[Name] has set you as
   an emergency contact on Hakwa. This is a test — you're all set!"_ and no
   `safetyIncident` row is created.

---

### User Story 5 — Automated In-Trip Safety Check-ins (Priority: P2)

The platform monitors every active trip server-side for three anomaly signals:
route deviation (>500 m from the expected route for >2 consecutive minutes),
prolonged stop (stationary for >8 minutes outside the pickup or drop-off
geofence), and extreme speed (>130 km/h for >30 seconds). When any signal fires,
the passenger receives a silent in-app check-in prompt: _"Are you OK? Tap to
confirm."_ If there is no response within 90 seconds, the system automatically
escalates: emergency contacts receive an SMS with the passenger's last known
location. The passenger can cancel the escalation up until the moment of
dispatch.

**Why this priority**: Automated monitoring catches situations where the
passenger cannot openly trigger SOS. It provides a safety net with no user
action required — matching the platform's zero-friction principle.

**Independent Test**: A mock trip with injected route-deviation coordinates can
trigger a `safetyCheckIn` record and a `safety.check_in_required` WebSocket
event, verifiable without any actual GPS hardware or live trip — independently
of the SOS and contacts systems.

**Acceptance Scenarios**:

1. **Given** an `in_progress` trip where GPS telemetry shows the vehicle is
   > 500 m from the planned route for >2 minutes, **When** the anomaly detector
   > fires, **Then** a `safetyCheckIn` row is created
   > (`type = "route_deviation"`, `status = "pending"`) and a
   > `safety.check_in_required` WebSocket event is emitted to the passenger.
2. **Given** a `safetyCheckIn` prompt received by the passenger, **When** they
   tap _"I'm OK"_ within 90 seconds, **Then** the `safetyCheckIn` row is updated
   to `status = "ok_confirmed"` and no escalation occurs.
3. **Given** a `safetyCheckIn` prompt not acknowledged within 90 seconds,
   **When** the escalation timer fires, **Then**: the `safetyCheckIn` status
   transitions to `"escalated"`; an SMS is sent to all active emergency contacts
   for that user containing the last known GPS location and driver details; and
   a `safetyIncident` row is created linked to the check-in.
4. **Given** an escalation in progress (within the 90-second window), **When**
   the passenger taps _"Cancel alert"_, **Then** the SMS dispatch is cancelled
   (if not yet sent) and the check-in row updates to `"cancelled"`.
5. **Given** a `pending` booking (no trip yet started), **When** the anomaly
   detector evaluates, **Then** no check-in is triggered — monitoring is active
   only during `in_progress` trips.
6. **Given** a driver with the anomaly detector enabled, **When** their vehicle
   enters an extreme-speed event (>130 km/h for >30 seconds), **Then** a
   `safetyCheckIn` row is created for the **passenger** (the person at risk)
   with `type = "speed_anomaly"`, not the driver.

---

### User Story 6 — Report a Safety Incident (Priority: P2)

During or after a trip, a passenger or driver can file a formal safety incident
report: selecting a category, optionally uploading evidence (photo or audio),
and submitting. Critical-category reports (physical threat, assault, wrong
vehicle) trigger immediate driver deactivation pending review. Non-critical
reports (verbal complaint) go to the standard review queue. The reporter
receives a tracking reference and can see the resolution status in their
history.

**Why this priority**: Incident reporting closes the feedback loop. Without a
formal process, dangerous drivers remain on the platform and repeated victims
have no recourse. It is also the primary data source for platform safety
analytics.

**Independent Test**: An authenticated user can call
`POST /safety/incidents/report` supplying a `tripId`, `category`, and optional
description to create a `safetyIncident` row with the appropriate initial status
and receive a reference code — independently of SOS, anomaly detection, or
contact management.

**Acceptance Scenarios**:

1. **Given** an authenticated passenger with a completed trip, **When** they
   open the report form and select a category, **Then** the category list shows:
   `assault`, `inappropriate_behaviour`, `wrong_vehicle`, `dangerous_driving`,
   `verbal_abuse`, `overcharge`, `no_show`, `other`.
2. **Given** a report with category `assault` or `wrong_vehicle`, **When** it is
   submitted, **Then** the associated driver's account status is set to
   `"suspended_pending_review"` atomically in the same transaction, and the
   safety team receives a `safety.critical_incident` WebSocket push and an email
   within 60 seconds.
3. **Given** a report with a non-critical category (e.g., `verbal_abuse`),
   **When** it is submitted, **Then** the `safetyIncident` row is created with
   `status = "open"` and no automatic driver suspension — the report enters the
   standard moderation queue.
4. **Given** a submitted report, **When** the response is returned, **Then** a
   human-readable reference code (e.g., `SAF-240316-A7X2`) is included so the
   reporter can follow up.
5. **Given** a report to which the user attaches an evidence file, **When** the
   file is uploaded, **Then** only image/jpeg, image/png, and audio/mp4 MIME
   types are accepted; max size is 10 MB; the file reference is stored on the
   `safetyIncident` as `evidenceUrl`.
6. **Given** a report that has been reviewed by the safety team, **When** the
   admin closes/resolves it, **Then** the reporter receives an in-app
   notification: _"Your safety report (SAF-…) has been reviewed. Thank you for
   keeping Hakwa safe."_

---

### User Story 7 — View Safety History and Follow-Up (Priority: P3)

Passengers and drivers can see a history of their own safety events: SOS
activations, incident reports filed, check-in escalations, and their resolution
statuses. This gives users confidence that reports lead to real outcomes and
lets them follow up with reference codes.

**Why this priority**: Transparency and accountability. Users who can see their
reports are being acted on are more likely to report again — and more likely to
trust the platform.

**Independent Test**: Calling `GET /safety/history` returns an authenticated
user's paginated list of `safetyIncident` and `safetyCheckIn` records mapped to
a summary DTO, without touching trip data or other users' records.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they call `GET /safety/history`,
   **Then** they receive a paginated list (20 per page) of their own incidents
   and check-ins, ordered by `createdAt` descending, including status and
   reference code.
2. **Given** a `safetyIncident` with a non-null `resolvedAt`, **When** the user
   views its detail, **Then** the resolution outcome is shown: `"resolved"`,
   `"unsubstantiated"`, or `"driver_actioned"`.
3. **Given** an open incident, **When** the user views their history, **Then**
   the entry shows `status = "open"` and a message: _"Under review — we'll
   update you when it's resolved."_

---

### Edge Cases

- **No emergency contacts configured**: If an SOS fires and the user has no
  registered contacts, the SOS still creates a `safetyIncident` row and alerts
  the platform safety team. The safety-card with Fiji emergency numbers is
  shown. The passenger is NOT blocked from triggering an SOS just because
  contacts are absent — the platform alert is the fallback.
- **Silent SOS with app in background/killed**: The volume-button gesture is
  registered by the OS-level service (foreground service on Android, background
  app refresh on iOS). If the OS has killed the app, this gesture CANNOT fire.
  The UX must communicate this limitation clearly in onboarding: _"For
  background SOS, keep the app running with the trip screen active."_
- **GPS unavailable at SOS time**: The last known GPS coordinate (from the most
  recent driver telemetry event) is used as the location snapshot. If no GPS
  reading is available within the last 5 minutes, `locationSnapshotJson` is null
  and the SMS omits the coordinates but still fires with driver details.
- **Trip ends while check-in is pending**: If the trip completes before the
  90-second check-in window, the check-in is automatically cancelled (status →
  `"trip_ended"`) and no escalation fires. The trip completion is a natural
  resolution signal.
- **Duplicate SOS triggers**: If the user activates SOS twice within 60 seconds
  for the same trip, the second activation is idempotent: the existing
  `safetyIncident` row is returned and no duplicate SMS is sent.
- **Passenger in a country without Fiji mobile coverage**: SMS delivery may
  fail. The safety SMS is sent regardless; if it fails, the `safetyIncident`
  records the failure and the platform safety team is still alerted via
  WebSocket push.
- **Driver blocked by the passenger**: A blocked driver cannot be matched with
  that passenger in future bookings.
- **Malicious false reports**: Three substantiated false incident reports by the
  same user within 30 days results in automatic account review. The abuse
  detection runs asynchronously and does not affect the primary report-creation
  path.

---

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: An SOS MUST be triggerable from the active-trip screen in ≤ 2 taps
  (long-press + countdown expiry). A silent variant MUST be triggerable via
  three rapid volume-up presses with the screen on or off.
- **FR-002**: An SOS MUST create a `safetyIncident` row with: `type`,
  `reporterId`, `tripId`, `locationSnapshotJson`, `status = "active"`, and
  `referenceCode` (format `SAF-YYMMDD-XXXX`).
- **FR-003**: Upon SOS activation, every active `safetyContact` for the
  triggering user MUST receive an SMS within 30 seconds containing: the
  counterpart's (driver or passenger) first name and vehicle plate, the current
  GPS location formatted as an OSM-compatible coordinate link (or Hakwa
  live-share URL), and the live share link if one exists.
- **FR-004**: Upon SOS activation, a `safety.sos_triggered` event MUST be
  emitted on the platform's safety WebSocket channel within 5 seconds, carrying
  the full incident payload.
- **FR-005**: The SOS pipeline MUST NOT block on SMS delivery. SMS is dispatched
  asynchronously off the critical path; the SOS is considered "fired" when the
  `safetyIncident` row is committed.
- **FR-006**: The 5-second cancellable countdown MUST be shown only on the
  standard (non-silent) SOS path. The silent path MUST fire immediately with no
  countdown.
- **FR-007**: A user MUST be able to register up to 3 emergency contacts. Each
  contact MUST store: `name` (max 80 chars), `phone` (E.164), `label` (optional,
  max 30 chars).
- **FR-008**: A `tripShare` token MUST be cryptographically random (min 128 bits
  entropy), URL-safe, and single-use per trip. Once revoked or expired,
  returning anything other than `410 Gone` is a bug.
- **FR-009**: The trip-share public endpoint MUST require no authentication. The
  share token is the sole access credential. The token MUST be treated as a
  secret — it MUST NOT be logged in access logs or included in error messages.
- **FR-010**: The trip-share response MUST include the driver's first name and
  vehicle plate but MUST NOT include the driver's full name, phone, address, or
  any passenger PII beyond the live GPS coordinates.
- **FR-011**: Trip-share live location updates MUST use Server-Sent Events (SSE)
  at a ≤ 5-second interval. WebSocket is not used for the unauthenticated share
  endpoint to avoid session complexity.
- **FR-012**: The safety code shown on both driver and passenger screens MUST be
  derived deterministically:
  `HMAC-SHA256(bookingId + ISO-date, SAFETY_CODE_SECRET)` truncated to 4 decimal
  digits. Derivation MUST use a server-held secret; clients MUST never receive
  or embed `SAFETY_CODE_SECRET`.
- **FR-013**: Route-deviation anomaly monitoring MUST run on each active-trip
  telemetry update during `in_progress` trips. Deviation threshold: >500 m from
  the planned route for >2 consecutive minutes.
- **FR-014**: Prolonged-stop anomaly: vehicle stationary (speed < 3 km/h) for
  > 8 minutes outside the pickup or drop-off geofence (100 m radius).
- **FR-015**: Speed anomaly: vehicle speed >130 km/h for >30 consecutive
  seconds.
- **FR-016**: Each anomaly MUST create exactly one `safetyCheckIn` row for the
  relevant trip. If the same anomaly type fires again on the same trip within 20
  minutes, it is suppressed (cooldown) — no duplicate check-in is created.
- **FR-017**: The check-in escalation timer is 90 seconds. Escalation means: SMS
  to all active emergency contacts + `safetyIncident` creation. The timer MUST
  be persisted in Redis (`safety:checkin:<checkInId>:expiry`) so it survives API
  server restarts.
- **FR-018**: Categories `assault` and `wrong_vehicle` MUST trigger immediate
  driver suspension (`merchant.status = "suspended_pending_review"`) inside the
  same database transaction as the `safetyIncident` insert. No async step.
- **FR-019**: All other incident categories go to the standard review queue with
  `safetyIncident.status = "open"`. No automatic driver action.
- **FR-020**: Evidence files MUST be validated for MIME type on upload (allowed:
  `image/jpeg`, `image/png`, `audio/mp4`). Files exceeding 10 MB MUST be
  rejected with `SAFETY_EVIDENCE_TOO_LARGE`. Files MUST be stored in the CDN
  under a non-guessable path. Raw filenames from the client MUST NOT be used.
- **FR-021**: A `safetyIncident` reference code MUST be globally unique,
  human-readable, and follow the format `SAF-YYMMDD-XXXX` where `XXXX` is 4
  random uppercase alphanumeric characters.
- **FR-022**: The safety history endpoint (`GET /safety/history`) MUST return
  only the requesting user's own records. Returning another user's records for
  any reason is a critical access-control violation.
- **FR-023**: All safety-related endpoints MUST require authentication. The sole
  exception is `GET /safety/share/:token` — protected by token secrecy alone.
- **FR-024**: The platform safety team channel MUST receive WebSocket pushes for
  `sos_triggered`, `check_in_escalated`, and `critical_incident` event types.
  Team members are identified by the `role = "safety_admin"` claim on their
  session.
- **FR-025**: An SOS fired within the last 60 seconds for the same trip MUST
  return the existing `safetyIncident` (idempotency). No duplicate row. No
  duplicate SMS.

### Key Entities

- **SafetyIncident**: The primary record for SOS events, wrong-vehicle flags,
  and formal incident reports. See FR-002 for field list. One row per event.
- **SafetyContact**: A trusted contact registered by a user. Up to 3 per user.
  Receives SMS on SOS or escalation. Does not require a Hakwa account.
- **TripShare**: A live-share session for an active trip. Contains the URL-safe
  token, expiry, status, and the `tripId` it tracks.
- **SafetyCheckIn**: A server-generated check-in prompt triggered by an anomaly
  detector. Tracks the 90-second response window and escalation state.

### Assumptions

- SMS delivery uses the same provider as the notification system (spec 008). No
  new SMS infrastructure is required.
- Driver GPS telemetry is available during `in_progress` trips via the existing
  WebSocket channel (spec 008). The anomaly worker reads from the same
  `location:driver:<driverId>` Redis key published during trip tracking.
- The platform's safety team uses an internal dashboard not specified here. This
  spec only defines the events and status fields they consume.
- Fiji's emergency numbers (Ambulance: 911, Police: 917, Fire: 910) are stored
  as named constants in the app, not fetched from the API.
- Evidence file upload uses a pre-signed CDN URL flow (client uploads directly
  to CDN; only the resulting URL is sent to the API). Binary upload to the API
  server is not supported.
- The silent SOS volume-gesture is a mobile OS integration and is out of scope
  for the backend spec. The backend only defines the API endpoint the mobile
  client calls when the gesture fires.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: SOS fires (creates `safetyIncident` row + emits WebSocket event)
  within 3 seconds of the API call completing.
- **SC-002**: SOS SMS is dispatched to emergency contacts within 30 seconds of
  the `safetyIncident` row being committed.
- **SC-003**: Zero SOS activations are silently dropped (no row created, no
  event emitted) — validated by automated tests and monitoring alerts.
- **SC-004**: Trip-share live location on the public page updates within 5
  seconds of new GPS telemetry arriving at the server.
- **SC-005**: Route-deviation check-in prompt is delivered to the passenger
  within 60 seconds of the anomaly threshold being crossed.
- **SC-006**: 100% of critical incident reports (assault, wrong_vehicle) result
  in driver suspension in the same DB transaction — validated by automated
  integration tests.
- **SC-007**: Zero cross-user data leaks from `GET /safety/history` or
  `GET /safety/share/:token` — validated by security tests.
- **SC-008**: Safety code shown on passenger and driver screens is identical for
  the same booking, with no client-side secret exposure.
