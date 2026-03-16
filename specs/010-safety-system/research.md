# Research: Rider & Driver Safety System

**Feature**: 010-safety-system  
**Status**: Resolved

---

## Decision 1: SOS Activation Pipeline

**Decision**: Long-press (2s) → 5-second countdown → Redis Stream
`safety:events` publish → SMS dispatch worker → WebSocket alert to safety team
channel.

**Rationale**: The countdown prevents accidental triggers while keeping the UX
simple — a single press-and-hold. Publishing to a Redis Stream decouples the SOS
activation (which must be instantaneous) from the SMS I/O (which can be slow).
The activation completes in a single DB write; SMS is fire-and-forget from the
user's perspective.

**Alternatives considered**:

- Direct Twilio call in the request handler — rejected: introduces latency and a
  Twilio failure would block the SOS response.
- Two-step confirmation (tap then confirm) — rejected: too many taps under
  stress; countdown-with-cancel achieves the same safety without the friction.

---

## Decision 2: Silent SOS via Volume Buttons

**Decision**: Three rapid volume-button presses (within 1.5s, screen on or off)
trigger the same SOS pipeline with no visible on-screen change until
confirmation. Implemented via a `VolumeButtonListener` in the mobile app.

**Rationale**: A passenger threatened by a driver cannot visibly operate their
phone. The silent path must be covert and physically natural. Volume buttons are
accessible without looking at the screen and do not require screen unlock on
most devices.

**Implementation note**: React Native does not expose a native volume button
API. Use `react-native-volume-manager` (Android) and a `CMMotionManager` bridge
(iOS) or `react-native-safe-area-context` shake variant. Trigger fires the same
`POST /api/v1/safety/sos` endpoint with `{ silent: true }` — the backend treats
it identically.

**Alternatives considered**:

- Shake gesture — rejected: too easy to trigger accidentally during bumpy rides.
- Disguised "Call Mum" button — implement as a UI alias that calls
  `triggerSOS()` — this is a complementary UX pattern over the same pipeline,
  not a separate decision.

---

## Decision 3: SOS Idempotency

**Decision**: On `POST /api/v1/safety/sos`, check for an existing
`safetyIncident` row with `(tripId, type='sos', status='active')`. If found,
return the existing record with HTTP 200 and a structured
`SAFETY_SOS_ALREADY_ACTIVE` code. No duplicate row, no duplicate SMS.

**Rationale**: A panicking user may tap SOS multiple times in rapid succession,
or an offline queue may replay a request. Idempotency prevents duplicate SMS
floods to emergency contacts and prevents duplicate safety-team alerts.

**Alternatives considered**:

- Unique constraint on `(trip_id, type)` — rejected: a trip can have multiple
  incidents of different types (route deviation escalation + formal report).
  Enforcing in application logic with a status filter is more flexible.

---

## Decision 4: Route Deviation Detection

**Decision**: The API server compares each incoming `POST /location` update
against the active trip's planned route polyline. If the driver's location
is >200m from the polyline for >60s, a `safety_check_in` row is created and a
push notification is sent to the passenger. If the passenger does not respond
within 90s, status transitions to `escalated` and a `safety_incident` is created
automatically.

**Rationale**: Automated anomaly detection adds a preventive layer before the
SOS stage. Using a 200m/60s threshold reduces false positives from minor traffic
detours. The 90-second response window gives passengers time to confirm safety
without creating urgent false alarms.

**Route deviation algorithm**:

1. On each `POST /location`, retrieve `trip.routePolyline` (GeoJSON LineString).
2. Compute minimum distance from driver point to any segment of the polyline.
3. Track consecutive deviation time in Redis key `deviation:{tripId}` (TTL 120s,
   reset on each on-route update).
4. If `deviationSeconds >= 60` → trigger check-in (once per deviation episode).

**Alternatives considered**:

- OSRM map matching — more accurate but adds infrastructure dependency for Phase
  1; GeoJSON polyline computation in `@hakwa/core` is sufficient.
- Client-side detection — rejected: driver could manipulate the client.

---

## Decision 5: SMS Dispatch

**Decision**: Use a `SmsService` interface in `@hakwa/notifications` with a
Twilio adapter in `pkg/notifications/src/adapters/twilio.ts`. SOS SMS content
includes: driver/vehicle details, a live-share URL, and Fiji emergency numbers.
Failures set `sms_failed = true` on the incident row and publish a fallback push
notification to the reporter.

**Fiji Emergency Numbers** (authoritative):

- Police: 917
- Ambulance: 911
- Fire: 910
- Search & Rescue: 917

**Rationale**: Twilio is the standard SMS provider. Abstracting behind
`SmsService` keeps the core logic testable and allows swapping providers without
changing business logic.

**SMS template**:

```
HAKWA SAFETY ALERT
[Name] is in a Hakwa trip with driver [DriverName] (Plate: [Plate]).
Track live: https://hakwa.af/live/[token]
Fiji emergency: Police 917 | Ambulance 911 | Fire 910
```

---

## Decision 6: Trip Share Token Generation

**Decision**: Generate a 128-bit cryptographically random token using
`crypto.randomBytes(16).toString('hex')` (32 hex chars), stored in the
`trip_share.token` column. The public route `/api/v1/safety/share/:token` does
not require authentication and returns driver name, vehicle, and a stream of
location updates.

**Rationale**: 128-bit random token provides sufficient entropy against
brute-force guessing. Using `crypto.randomBytes` (not `uuid`) ensures no
structure-based entropy loss. Token must NOT appear in access logs.

**Alternatives considered**:

- UUID v4 — lower effective entropy in some Postgres/Node versions; dedicated
  `randomBytes` is more explicit about the entropy guarantee.

---

## Decision 7: Safety Incident State Machine

**Decision**:

```
SOS / auto-escalation → active
    ↓
acknowledged (safety team agent takes the case)
    ↓
open (investigation ongoing)
    ↓
resolved | unsubstantiated | driver_actioned
```

Formal reports enter at `open` directly. Automated anomaly escalations enter at
`active`.

**Driver suspension**: When a formal report with `category = "assault"` reaches
`driver_actioned`, the driver's `merchant.status` transitions to
`suspended_pending_review` automatically (FR-018). This transition is atomic
with the incident status update.

**Alternatives considered**:

- Flat status with separate `severity` field — more flexible but harder to
  reason about workflow transitions in code.

---

## Decision 8: Check-In Worker

**Decision**: A dedicated worker in `@hakwa/workers` polls for `safety_check_in`
rows in `pending` status older than 90 seconds. If found and trip is still
`in_progress`, transitions the check-in to `escalated` and creates a
`safetyIncident`. Poll interval: 15 seconds.

**Rationale**: Using a polling worker (rather than a scheduled cron) allows
sub-minute resolution without a persistent timer per trip. 15s poll interval
means worst-case escalation delay is 90s + 15s = 105s, acceptable for the safety
SLA.

**Alternatives considered**:

- Redis TTL expiry key — unreliable for precise timing (Redis key expiry fires
  eventually, not exactly); polling is predictable.
- One timeout per check-in via `setTimeout` in the API process — not safe; API
  process restarts would silently drop the escalation.
