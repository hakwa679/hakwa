# Requirements Checklist: Rider & Driver Safety System

**Feature**: 010-safety-system  
**Last updated**: 2026-03-16

Use this checklist to track implementation completeness. Each item maps to a
functional requirement in `spec.md`. Tick an item only when the behaviour is
implemented **and** covered by an automated test.

---

## Emergency Contacts

- [ ] **FR-007** — User can add up to 3 active emergency contacts (name, E.164
      phone, optional label)
- [ ] **FR-007** — Fourth contact rejected with `SAFETY_CONTACT_LIMIT_REACHED`
- [ ] **FR-007** — Phone numbers stored in E.164 normalised format regardless of
      input format
- [ ] **FR-007** — `DELETE /safety/contacts/:id` deletes only the caller's own
      contact
- [ ] **FR-007** — Test-alert SMS queued for all active contacts; no
      `safetyIncident` row created

---

## SOS

- [ ] **FR-001** — SOS endpoint callable from active-trip screen context in ≤ 2
      API calls
- [ ] **FR-002** — SOS creates `safetyIncident` row with correct fields: `type`,
      `reporterId`, `tripId`, `locationSnapshotJson`, `status = "active"`,
      `referenceCode`
- [ ] **FR-002** — `referenceCode` follows format `SAF-YYMMDD-XXXX` and is
      globally unique
- [ ] **FR-003** — SMS queued to every active `safetyContact` within 30 seconds
      of incident creation
- [ ] **FR-003** — SMS content includes counterpart name, vehicle plate, Google
      Maps URL, and live-share link (if exists)
- [ ] **FR-004** — `safety.sos_triggered` WebSocket event emitted on
      `safety:team` channel within 5 seconds
- [ ] **FR-005** — SOS endpoint returns before SMS delivery completes (async
      dispatch)
- [ ] **FR-006** — Silent SOS (`silent: true`) fires without countdown — no
      client-side countdown needed
- [ ] **FR-025** — Duplicate SOS within 60 seconds returns existing
      `safetyIncident` with `200 OK`; no second SMS dispatched
- [ ] **FR-025** — `safety:sos_dedup:<tripId>` Redis key has 60-second TTL
- [ ] **Symmetric** — SOS works identically for drivers (driver triggers,
      passenger's counterpart details in SMS)
- [ ] **Edge case** — SOS fires even when user has zero emergency contacts;
      safety team still alerted

---

## Trip Sharing

- [ ] **FR-008** — `tripShare.token` is cryptographically random with ≥ 128-bit
      entropy, URL-safe
- [ ] **FR-008** — Creating a share while an `active` share exists revokes
      previous token and creates new one
- [ ] **FR-009** — `GET /safety/share/:token` requires no authentication
- [ ] **FR-009** — Token is never logged in access logs or included in error
      messages
- [ ] **FR-010** — Share response includes driver first name and vehicle plate
      only — no surname, phone, or passenger PII beyond GPS
- [ ] **FR-011** — SSE stream at `/safety/share/:token/stream` sends `location`
      events at ≤ 5-second intervals
- [ ] **FR-011** — SSE emits `share_expired` event when share is revoked/expired
      and closes connection
- [ ] **FR-008** — Expired/revoked share URL returns `410 Gone` with correct
      message
- [ ] **FR-008** — Share expiry set to `trip.completedAt + 15 min`; updated when
      trip completes
- [ ] `DELETE /safety/trips/:tripId/share` revokes share and marks
      `tripShare.status = "revoked"`
- [ ] **Prompt** — Route-deviation anomaly triggers a one-tap share prompt if no
      share is active (in-app, not API)

---

## Vehicle Verification (Safety Code)

- [ ] **FR-012** — Safety code derived as
      `HMAC-SHA256(bookingId + ISO-date, SAFETY_CODE_SECRET)` truncated to 4
      decimal digits
- [ ] **FR-012** — Same code shown on passenger and driver screens for the same
      booking
- [ ] **FR-012** — Code rotates at UTC midnight (next-day code is different)
- [ ] **FR-012** — Code derivable client-side with no API call required
- [ ] `GET /safety/trips/:tripId/verify` returns code + full vehicle details to
      the passenger
- [ ] `POST /safety/trips/:tripId/wrong-vehicle` creates `safetyIncident` of
      `type = "wrong_vehicle"` and triggers driver suspension (FR-018)

---

## Anomaly Detection & Check-ins

- [ ] **FR-013** — Route-deviation worker polls active-trip GPS telemetry every
      30 seconds
- [ ] **FR-013** — Deviation threshold: >500 m from planned route for >2
      consecutive minutes
- [ ] **FR-014** — Prolonged-stop threshold: speed < 3 km/h for >8 minutes
      outside 100 m pickup/dropoff geofence
- [ ] **FR-015** — Speed threshold: >130 km/h for >30 consecutive seconds
- [ ] **FR-016** — Each anomaly type creates exactly one `safetyCheckIn` per
      trip per 20-minute cooldown window
- [ ] **FR-016** — Cooldown enforced via
      `safety:anomaly_cooldown:<tripId>:<type>` Redis key with 20-minute TTL
- [ ] **FR-016** — No check-in created for trips not in `in_progress` status
- [ ] **FR-017** — Check-in escalation timer persisted in Redis:
      `safety:checkin:<checkInId>:expiry` (90 s TTL)
- [ ] **FR-017** — Escalation fires if Redis key expires without user response:
      SMS to contacts + `safetyIncident` created
- [ ] **FR-017** — `safety.check_in_escalated` WebSocket event emitted on
      `safety:team` channel
- [ ] `POST /safety/check-ins/:checkInId/respond` with `"ok"` sets status
      `ok_confirmed` and cancels escalation
- [ ] `POST /safety/check-ins/:checkInId/respond` with `"cancel"` sets status
      `cancelled` and cancels escalation
- [ ] **Edge case** — Trip completion before 90 s window sets check-in to
      `trip_ended`; no escalation fires
- [ ] **FR-016** — Speed anomaly check-in targets the passenger, not the driver

---

## Incident Reporting

- [ ] **FR-018** — `assault` and `wrong_vehicle` reports trigger
      `merchant.status = "suspended_pending_review"` in the same DB transaction
- [ ] **FR-018** — `safety.critical_incident` WebSocket event emitted to
      `safety:team` within 60 seconds for critical categories
- [ ] **FR-019** — Non-critical reports create `safetyIncident` with
      `status = "open"`; no driver action
- [ ] **FR-020** — Evidence file MIME type validated: only `image/jpeg`,
      `image/png`, `audio/mp4` accepted
- [ ] **FR-020** — Evidence files >10 MB rejected with
      `SAFETY_EVIDENCE_TOO_LARGE`
- [ ] **FR-020** — Evidence stored under non-guessable CDN path; raw client
      filename not used
- [ ] **FR-021** — Reference code `SAF-YYMMDD-XXXX` is globally unique and
      human-readable
- [ ] Reporter receives in-app notification when admin resolves their incident

---

## Safety History

- [ ] **FR-022** — `GET /safety/history` returns only the authenticated caller's
      own records
- [ ] **FR-022** — Attempting to access another user's records returns empty
      list or `403` — never leaks data
- [ ] History paginated at 20 per page; `limit` max 50
- [ ] Response includes `referenceCode`, `type`, `category`, `status`,
      `resolutionOutcome`

---

## Security & Access Control

- [ ] **FR-023** — All safety endpoints (except `GET /safety/share/:token`)
      require authentication
- [ ] **FR-023** — Unauthenticated requests to protected endpoints return `401`
      with no data
- [ ] **FR-024** — `safety.sos_triggered`, `safety.critical_incident`,
      `safety.check_in_escalated` only sent to `safety_admin` sessions
- [ ] **FR-010** — No full name, driver phone, or passenger PII beyond GPS in
      share response
- [ ] Token never appears in server logs, error messages, or 410 response bodies
- [ ] HMAC secret `SAFETY_CODE_SECRET` is an environment variable; never
      hardcoded

---

## Success Criteria Validation

- [ ] **SC-001** — SOS `safetyIncident` row created and WebSocket event emitted
      within 3 seconds of API call
- [ ] **SC-002** — SOS SMS queued within 30 seconds (measured in integration
      tests with mock SMS provider)
- [ ] **SC-003** — Zero SOS activations silently dropped — monitoring alert
      configured for `safetyIncident` creation failures
- [ ] **SC-004** — SSE location update visible on share page within 5 seconds of
      telemetry arrival
- [ ] **SC-005** — Check-in prompt delivered within 60 seconds of anomaly
      threshold crossing
- [ ] **SC-006** — 100% of `assault` / `wrong_vehicle` reports result in driver
      suspension in same transaction — verified by integration test
- [ ] **SC-007** — Security tests confirm no cross-user data from history or
      share endpoints
- [ ] **SC-008** — Safety code identical on passenger and driver screens;
      derived with zero server round-trips
