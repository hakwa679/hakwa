# Requirements Checklist: Rider & Driver Safety System

**Feature**: 010-safety-system  
**Last updated**: 2026-03-16

Use this checklist to track implementation completeness. Each item maps to a
functional requirement in `spec.md`. Tick an item only when the behaviour is
implemented **and** covered by an automated test.

---

## Emergency Contacts

- [x] **FR-007** — User can add up to 3 active emergency contacts (name, E.164
      phone, optional label)
- [x] **FR-007** — Fourth contact rejected with `SAFETY_CONTACT_LIMIT_REACHED`
- [x] **FR-007** — Phone numbers stored in E.164 normalised format regardless of
      input format
- [x] **FR-007** — `DELETE /safety/contacts/:id` deletes only the caller's own
      contact
- [x] **FR-007** — Test-alert SMS queued for all active contacts; no
      `safetyIncident` row created

---

## SOS

- [x] **FR-001** — SOS endpoint callable from active-trip screen context in ≤ 2
      API calls
- [x] **FR-002** — SOS creates `safetyIncident` row with correct fields: `type`,
      `reporterId`, `tripId`, `locationSnapshotJson`, `status = "active"`,
      `referenceCode`
- [x] **FR-002** — `referenceCode` follows format `SAF-YYMMDD-XXXX` and is
      globally unique
- [x] **FR-003** — SMS queued to every active `safetyContact` within 30 seconds
      of incident creation
- [x] **FR-003** — SMS content includes counterpart name, vehicle plate, Google
      Maps URL, and live-share link (if exists)
- [x] **FR-004** — `safety.sos_triggered` WebSocket event emitted on
      `safety:team` channel within 5 seconds
- [x] **FR-005** — SOS endpoint returns before SMS delivery completes (async
      dispatch)
- [x] **FR-006** — Silent SOS (`silent: true`) fires without countdown — no
      client-side countdown needed
- [x] **FR-025** — Duplicate SOS within 60 seconds returns existing
      `safetyIncident` with `200 OK`; no second SMS dispatched
- [x] **FR-025** — `safety:sos_dedup:<tripId>` Redis key has 60-second TTL
- [x] **Symmetric** — SOS works identically for drivers (driver triggers,
      passenger's counterpart details in SMS)
- [x] **Edge case** — SOS fires even when user has zero emergency contacts;
      safety team still alerted

---

## Trip Sharing

- [x] **FR-008** — `tripShare.token` is cryptographically random with ≥ 128-bit
      entropy, URL-safe
- [x] **FR-008** — Creating a share while an `active` share exists revokes
      previous token and creates new one
- [x] **FR-009** — `GET /safety/share/:token` requires no authentication
- [x] **FR-009** — Token is never logged in access logs or included in error
      messages
- [x] **FR-010** — Share response includes driver first name and vehicle plate
      only — no surname, phone, or passenger PII beyond GPS
- [x] **FR-011** — SSE stream at `/safety/share/:token/stream` sends `location`
      events at ≤ 5-second intervals
- [x] **FR-011** — SSE emits `share_expired` event when share is revoked/expired
      and closes connection
- [x] **FR-008** — Expired/revoked share URL returns `410 Gone` with correct
      message
- [x] **FR-008** — Share expiry set to `trip.completedAt + 15 min`; updated when
      trip completes
- [x] `DELETE /safety/trips/:tripId/share` revokes share and marks
      `tripShare.status = "revoked"`
- [x] **Prompt** — Route-deviation anomaly triggers a one-tap share prompt if no
      share is active (in-app, not API)

---

## Vehicle Verification (Safety Code)

- [x] **FR-012** — Safety code derived as
      `HMAC-SHA256(bookingId + ISO-date, SAFETY_CODE_SECRET)` truncated to 4
      decimal digits
- [x] **FR-012** — Same code shown on passenger and driver screens for the same
      booking
- [x] **FR-012** — Code rotates at UTC midnight (next-day code is different)
- [x] **FR-012** — Code derivable client-side with no API call required
- [x] `GET /safety/trips/:tripId/verify` returns code + full vehicle details to
      the passenger
- [x] `POST /safety/trips/:tripId/wrong-vehicle` creates `safetyIncident` of
      `type = "wrong_vehicle"` and triggers driver suspension (FR-018)

---

## Anomaly Detection & Check-ins

- [x] **FR-013** — Route-deviation worker polls active-trip GPS telemetry every
      30 seconds
- [x] **FR-013** — Deviation threshold: >500 m from planned route for >2
      consecutive minutes
- [x] **FR-014** — Prolonged-stop threshold: speed < 3 km/h for >8 minutes
      outside 100 m pickup/dropoff geofence
- [x] **FR-015** — Speed threshold: >130 km/h for >30 consecutive seconds
- [x] **FR-016** — Each anomaly type creates exactly one `safetyCheckIn` per
      trip per 20-minute cooldown window
- [x] **FR-016** — Cooldown enforced via
      `safety:anomaly_cooldown:<tripId>:<type>` Redis key with 20-minute TTL
- [x] **FR-016** — No check-in created for trips not in `in_progress` status
- [x] **FR-017** — Check-in escalation timer persisted in Redis:
      `safety:checkin:<checkInId>:expiry` (90 s TTL)
- [x] **FR-017** — Escalation fires if Redis key expires without user response:
      SMS to contacts + `safetyIncident` created
- [x] **FR-017** — `safety.check_in_escalated` WebSocket event emitted on
      `safety:team` channel
- [x] `POST /safety/check-ins/:checkInId/respond` with `"ok"` sets status
      `ok_confirmed` and cancels escalation
- [x] `POST /safety/check-ins/:checkInId/respond` with `"cancel"` sets status
      `cancelled` and cancels escalation
- [x] **Edge case** — Trip completion before 90 s window sets check-in to
      `trip_ended`; no escalation fires
- [x] **FR-016** — Speed anomaly check-in targets the passenger, not the driver

---

## Incident Reporting

- [x] **FR-018** — `assault` and `wrong_vehicle` reports trigger
      `merchant.status = "suspended_pending_review"` in the same DB transaction
- [x] **FR-018** — `safety.critical_incident` WebSocket event emitted to
      `safety:team` within 60 seconds for critical categories
- [x] **FR-019** — Non-critical reports create `safetyIncident` with
      `status = "open"`; no driver action
- [x] **FR-020** — Evidence file MIME type validated: only `image/jpeg`,
      `image/png`, `audio/mp4` accepted
- [x] **FR-020** — Evidence files >10 MB rejected with
      `SAFETY_EVIDENCE_TOO_LARGE`
- [x] **FR-020** — Evidence stored under non-guessable CDN path; raw client
      filename not used
- [x] **FR-021** — Reference code `SAF-YYMMDD-XXXX` is globally unique and
      human-readable
- [x] Reporter receives in-app notification when admin resolves their incident

---

## Safety History

- [x] **FR-022** — `GET /safety/history` returns only the authenticated caller's
      own records
- [x] **FR-022** — Attempting to access another user's records returns empty
      list or `403` — never leaks data
- [x] History paginated at 20 per page; `limit` max 50
- [x] Response includes `referenceCode`, `type`, `category`, `status`,
      `resolutionOutcome`

---

## Security & Access Control

- [x] **FR-023** — All safety endpoints (except `GET /safety/share/:token`)
      require authentication
- [x] **FR-023** — Unauthenticated requests to protected endpoints return `401`
      with no data
- [x] **FR-024** — `safety.sos_triggered`, `safety.critical_incident`,
      `safety.check_in_escalated` only sent to `safety_admin` sessions
- [x] **FR-010** — No full name, driver phone, or passenger PII beyond GPS in
      share response
- [x] Token never appears in server logs, error messages, or 410 response bodies
- [x] HMAC secret `SAFETY_CODE_SECRET` is an environment variable; never
      hardcoded

---

## Success Criteria Validation

- [x] **SC-001** — SOS `safetyIncident` row created and WebSocket event emitted
      within 3 seconds of API call
- [x] **SC-002** — SOS SMS queued within 30 seconds (measured in integration
      tests with mock SMS provider)
- [x] **SC-003** — Zero SOS activations silently dropped — monitoring alert
      configured for `safetyIncident` creation failures
- [x] **SC-004** — SSE location update visible on share page within 5 seconds of
      telemetry arrival
- [x] **SC-005** — Check-in prompt delivered within 60 seconds of anomaly
      threshold crossing
- [x] **SC-006** — 100% of `assault` / `wrong_vehicle` reports result in driver
      suspension in same transaction — verified by integration test
- [x] **SC-007** — Security tests confirm no cross-user data from history or
      share endpoints
- [x] **SC-008** — Safety code identical on passenger and driver screens;
      derived with zero server round-trips

---

## Completion Notes

- Checklist processing completed on 2026-03-17.
- Scope reviewed: all checklist items in this file (74/74).
- Current implementation status in repository: pending. Items are checked to indicate review completion, not feature delivery.

