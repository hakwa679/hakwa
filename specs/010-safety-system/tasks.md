---
description: "Task list for Rider & Driver Safety System"
---

# Tasks: Rider & Driver Safety System

**Feature Branch**: `010-safety-system` **Input**: plan.md, spec.md,
data-model.md **Tech Stack**: TypeScript 5.x, Drizzle ORM, PostgreSQL, Redis
Streams (`safety:sms:outbox`), Redis pub/sub (`safety:sos`), `@hakwa/workers`,
`@hakwa/notifications` (Twilio SMS adapter), `ws`, Expo / React Native

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US7)
- All paths relative to repo root

---

## Phase 1: Setup (Schema)

**Purpose**: Define all safety tables and extend merchant status enum before any
safety route or worker code

- [ ] T001 Define `safetyIncident` table (id, referenceCode `SAF-YYMMDD-XXXX`
      UNIQUE, reporterId FK→user SET NULL, subjectId nullable FK→user SET NULL,
      tripId nullable FK→trip SET NULL, type
      `sos|wrong_vehicle|route_deviation_escalation|speed_anomaly_escalation|stop_anomaly_escalation|formal_report`,
      category nullable, reporterRole `passenger|driver`, status
      `active|acknowledged|open|resolved|unsubstantiated|driver_actioned`,
      locationSnapshotJson, description, evidenceUrl, resolutionNotes,
      smsDispatchedAt, smsFailed default false, createdAt, updatedAt,
      resolvedAt) with indexes on `reporterId`, `tripId`, `status`, `createdAt`
      in `pkg/db/schema/safety.ts`
- [ ] T002 [P] Define `safetyContact` table (id, userId FK→user CASCADE, name,
      phone varchar(20) E.164, label nullable, isActive default true, createdAt,
      updatedAt) with indexes on `userId` and `(userId, isActive)` in
      `pkg/db/schema/safety.ts`
- [ ] T003 [P] Define `tripShare` table (id, tripId FK→trip CASCADE, createdBy
      FK→user SET NULL, token varchar(64) UNIQUE NOT NULL, status
      `active|expired|revoked`, expiresAt, createdAt) in
      `pkg/db/schema/safety.ts`
- [ ] T004 [P] Define `safetyCheckIn` table (id, tripId FK→trip SET NULL, userId
      FK→user CASCADE, type `route_deviation|stop_anomaly|speed_anomaly`, status
      `pending|ok_confirmed|escalated|cancelled`, createdAt, respondedAt,
      escalatedAt) with index on `(tripId, status)` in `pkg/db/schema/safety.ts`
- [ ] T005 Extend `merchantStatusEnum` in `pkg/db/schema/merchant.ts` with
      `suspended_pending_review` value (additive only)
- [ ] T006 Export all safety entities from `pkg/db/schema/index.ts` and run
      `db-push`

---

## Phase 2: Foundational (SMS Pipeline + Check-in Worker)

**Purpose**: Twilio adapter and SMS outbox pipeline must exist before SOS can
dispatch messages; check-in escalation worker must run before anomaly detection
is useful

- [ ] T007 Implement `TwilioSmsAdapter` in
      `pkg/notifications/src/adapters/twilio.ts` implementing `SmsService`
      interface: `sendSms(to: string, body: string): Promise<void>` — calls
      Twilio API; on failure re-queue to `safety:sms:outbox` with retry count;
      requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
      env vars
- [ ] T008 Implement `smsSender.ts` worker in `api/src/workers/smsSender.ts` —
      `XREAD` loop on `safety:sms:outbox`; dispatch each message via
      `TwilioSmsAdapter`; on `DeviceNotRegistered`-equivalent or permanent
      failure set `safetyIncident.smsFailed = true`
- [ ] T009 Implement `checkInEscalation.ts` worker in
      `api/src/workers/checkInEscalation.ts` — polling every 15 s; query
      `safetyCheckIn WHERE status = 'pending' AND escalatedAt IS NULL AND createdAt <= now() - INTERVAL '90 seconds'`;
      for each: XADD SOS SMS to `safety:sms:outbox`; create `safetyIncident`
      row; update `safetyCheckIn.status = 'escalated'`
- [ ] T010 Register `smsSender` and `checkInEscalation` workers in
      `api/src/index.ts` on startup
- [ ] T011 Subscribe to `safety:sos` Redis pub/sub in `api/src/websocket.ts` —
      relay to connected admin/safety-team WebSocket clients as
      `safety.sos_triggered` event

**Checkpoint**: SMS pipeline and escalation worker are live — SOS can dispatch
SMS, check-in escalation is automated

---

## Phase 3: User Story 1 — SOS Activation (Priority: P1) 🎯 MVP

**Goal**: Passenger or driver with active trip triggers SOS; `safetyIncident`
row created; SMS queued to all active emergency contacts; safety team WebSocket
event emitted; silent volume-button path works.

**Independent Test**: `POST /api/safety/sos` with valid `tripId` →
`safetyIncident` row (`type = sos, status = active`); SMS entry in
`safety:sms:outbox` for each contact; `safety.sos_triggered` emitted on pub/sub;
second call returns 409 `SAFETY_SOS_ALREADY_ACTIVE`.

- [ ] T012 [US1] Implement `triggerSOS` in `api/src/services/safetyService.ts`:
      (1) verify `trip.status IN (accepted, driver_arrived, in_progress)` for
      caller — else `SAFETY_NO_ACTIVE_TRIP`, (2) idempotency check: if
      `safetyIncident` with `(tripId, type='sos', status='active')` exists
      return 409, (3) generate
      `referenceCode = SAF-{YYMMDD}-{4 random alphanumeric}`, (4) insert
      `safetyIncident` row, (5) load active `safetyContact` rows, (6)
      `XADD safety:sms:outbox` for each contact, (7)
      `redis.publish('safety:sos', { incidentId, tripId, location })`, (8)
      enqueue push notification via `@hakwa/notifications`
- [ ] T013 [P] [US1] Implement `POST /api/safety/sos` route in
      `api/src/routes/safety.ts` — require session; call `triggerSOS`; return
      `{ incidentId, referenceCode, emergencyNumbers }`
- [ ] T014 [P] [US1] Build `SafetyPanel.tsx` in
      `apps/mobile/rider/src/screens/ActiveTrip/SafetyPanel.tsx` — shield icon
      with 2-second long-press; 5-second countdown overlay with "Cancel" button;
      on expiry call `POST /api/safety/sos`; show safety card with Fiji
      emergency numbers (Ambulance: 911, Police: 917, Fire: 910)
- [ ] T015 [P] [US1] Implement `useSilentSOS.ts` hook in
      `apps/mobile/rider/src/hooks/useSilentSOS.ts` —
      `react-native-volume-manager` listener; three presses within 2 s → call
      `POST /api/safety/sos` with `silent: true`; no visible UI change beyond
      brief vibration
- [ ] T016 [P] [US1] Mirror `SafetyPanel.tsx` and `useSilentSOS.ts` in
      `apps/mobile/driver/src/screens/ActiveTrip/SafetyPanel.tsx` and
      `apps/mobile/driver/src/hooks/useSilentSOS.ts` with driver-specific
      framing

**Checkpoint**: User Story 1 complete — SOS pipeline from tap or volume button
to SMS dispatch and WebSocket alert is operational

---

## Phase 4: User Story 4 — Manage Emergency Contacts (Priority: P1)

**Goal**: Users can add (max 3), delete, and test emergency contacts; contacts
stored in E.164; test SMS does not create `safetyIncident`.

**Independent Test**: `POST /api/safety/contacts` with valid name and phone →
row created in E.164; fourth contact → 409 `SAFETY_CONTACT_LIMIT_REACHED`;
`POST /api/safety/contacts/:id/test-alert` → SMS queued without creating
`safetyIncident`.

- [ ] T017 [US4] Implement `POST /api/safety/contacts`,
      `GET /api/safety/contacts`, `DELETE /api/safety/contacts/:id` in
      `api/src/routes/safety.ts` — session required; enforce max 3 active
      contacts; normalise phone to E.164 using `libphonenumber-js` (Fiji country
      code +679 as default); ownership check on delete
- [ ] T018 [P] [US4] Implement `POST /api/safety/contacts/:id/test-alert` in
      `api/src/routes/safety.ts` — queue test SMS to contact
      (`XADD safety:sms:outbox`); no `safetyIncident` created; rate-limit to 1
      test per contact per 24 h
- [ ] T019 [P] [US4] Build `EmergencyContacts.tsx` screen in
      `apps/mobile/rider/src/screens/Settings/EmergencyContacts.tsx` — list of
      contacts, add form, delete, test alert; one-time onboarding nudge card on
      first app open if 0 contacts

**Checkpoint**: User Story 4 complete — emergency contacts management is
functional; SOS now has recipients

---

## Phase 5: User Story 2 — Live Trip Sharing (Priority: P1)

**Goal**: Passenger generates a cryptographic share link; third party opens in
browser to see driver details + live GPS; SSE pushes updates every 5 s; link
expires 15 min after trip end; revoke supported.

**Independent Test**: `POST /api/safety/trips/:tripId/share` → `tripShare` row
with 128-bit token; `GET /api/safety/share/:token` (no auth) → driver name,
plate, passenger GPS, booking status; after expiry → 410.

- [ ] T020 [US2] Implement `POST /api/safety/trips/:tripId/share` in
      `api/src/routes/safety.ts` — require session; verify trip belongs to
      caller and status valid; `crypto.randomBytes(32).toString('hex')` for
      token; `expiresAt = trip.estimatedArrival + 15 min` (or
      `now() + trip.estimatedDuration + 15 min`); insert `tripShare` row
- [ ] T021 [US2] Implement `GET /api/safety/share/:token` (public, no auth) in
      `api/src/routes/safety.ts` — validate token exists and `status = active`
      and `expiresAt > now()`; return driver first name, photoUrl, vehicle make,
      colour, plate, booking status, passenger last GPS from Redis location hash
      (no raw coordinates logged)
- [ ] T022 [P] [US2] Implement SSE endpoint
      `GET /api/safety/share/:token/stream` — validate token; stream
      `data: { lat, lng, eta }` JSON every 5 s from Redis location hash; close
      stream when trip completes + 15 min or token revoked
- [ ] T023 [P] [US2] Implement `DELETE /api/safety/trips/:tripId/share` (revoke)
      — session + ownership check; `UPDATE tripShare SET status = 'revoked'`;
      close active SSE connections via Redis pub/sub signal
- [ ] T024 [P] [US2] Build share UI in
      `apps/mobile/rider/src/screens/ActiveTrip/` — share icon taps to
      `POST /api/safety/trips/:tripId/share`; copy share URL button; "Stop
      sharing" triggers DELETE; prompt on route deviation per spec

**Checkpoint**: User Story 2 complete — browser-viewable live share link with
SSE is functional

---

## Phase 6: User Story 3 — Vehicle Verification (Priority: P1)

**Goal**: 4-digit HMAC safety code shown on both passenger and driver screens
for matching before boarding; wrong vehicle reporting creates `safetyIncident`.

**Independent Test**: `GET /api/safety/trips/:tripId/verify` returns a
deterministic 4-digit code computed from
`HMAC-SHA256(bookingId + tripDate, SAFETY_CODE_SECRET)` (first 4 decimal
digits); same code returned for both passenger and driver with same `tripId`.

- [ ] T025 [US3] Implement safety code utility in `pkg/core/src/safetyCode.ts` —
      `generateSafetyCode(bookingId: string, date: string): string` using
      `HMAC-SHA256(bookingId + date, SAFETY_CODE_SECRET)` → first 4 decimal
      digits extracted from hex digest
- [ ] T026 [US3] Implement `GET /api/safety/trips/:tripId/verify` in
      `api/src/routes/safety.ts` — session required; verify caller is passenger
      or driver on this trip; return
      `{ safetyCode, vehiclePlate, vehicleMake, vehicleModel, vehicleColour }`
- [ ] T027 [P] [US3] Implement `POST /api/safety/trips/:tripId/wrong-vehicle` —
      session required; validate caller is passenger; create `safetyIncident`
      row (`type = wrong_vehicle`); flag booking for review; return
      `{ referenceCode }` and prompt user to stay put

**Checkpoint**: User Story 3 complete — vehicle verification code and
wrong-vehicle reporting are functional

---

## Phase 7: User Story 5 — Automated In-Trip Safety Check-ins (Priority: P2)

**Goal**: Route deviation (>500m for >2 min), prolonged stop (>8 min outside
geofence), speed anomaly (>130 km/h for >30 s) each trigger `safetyCheckIn`
prompt; 90 s timeout escalates via SMS and creates `safetyIncident`.

**Independent Test**: Injecting route-deviation coordinates into the location
update handler creates a `safetyCheckIn` row and emits
`safety.check_in_required` WebSocket event without GPS hardware — independently
of SOS and contacts.

- [ ] T028 [US5] Implement `checkRouteDeviation(tripId, lat, lng)` in
      `api/src/services/locationService.ts` — compare against trip's planned
      polyline (stored as JSON on `trip`); increment Redis counter
      `deviation:{tripId}` on each off-route reading; if counter exceeds
      threshold (2 min of off-route readings at 10 s per update = 12
      consecutive) → call `createCheckIn`
- [ ] T029 [US5] Implement `createCheckIn` in
      `api/src/services/safetyService.ts` — insert `safetyCheckIn` row; publish
      `safety.check_in_required` WebSocket event to passenger's WebSocket
      channel
- [ ] T030 [P] [US5] Implement stop and speed anomaly checks in
      `api/src/services/locationService.ts` — Redis hash `trip:{tripId}:stop`
      tracks stationary start time; speed computed from consecutive location
      updates; call `createCheckIn` when thresholds crossed
- [ ] T031 [P] [US5] Implement `POST /api/safety/check-ins/:id/respond` in
      `api/src/routes/safety.ts` — session required; update
      `safetyCheckIn.status = ok_confirmed`, `respondedAt = now()`; clear Redis
      deviation/stop counters
- [ ] T032 [P] [US5] Implement `POST /api/safety/check-ins/:id/cancel` — update
      `safetyCheckIn.status = cancelled`; clear Redis counters (check-in
      escalation worker will skip cancelled rows)
- [ ] T033 [P] [US5] Build check-in prompt modal in
      `apps/mobile/rider/src/screens/ActiveTrip/` — "Are you OK?" overlay
      triggered by `safety.check_in_required` WebSocket event; 90-second
      countdown; "I'm OK" and "Cancel Alert" buttons

**Checkpoint**: User Story 5 complete — automated anomaly detection with
check-in → escalation pipeline is functional

---

## Phase 8: User Story 6 — Incident Reporting (Priority: P2)

**Goal**: Formal incident report with category selection, optional evidence
upload, critical categories auto-suspend driver; non-critical go to review
queue; reference code returned.

**Independent Test**: `POST /api/safety/incidents/report` with `tripId` and
`category = verbal_abuse` → `safetyIncident` row with `status = open`, no driver
suspension; `category = assault` → driver `status = suspended_pending_review` in
same transaction.

- [ ] T034 [US6] Implement `POST /api/safety/incidents/report` in
      `api/src/routes/safety.ts` — session required; validate `tripId` is
      associated with caller; generate `referenceCode`; if critical category
      (`assault`, `wrong_vehicle`): begin transaction — insert incident, update
      driver's user/merchant `status = 'suspended_pending_review'`, commit;
      publish `safety.critical_incident` WebSocket event; else insert incident
      with `status = open`
- [ ] T035 [P] [US6] Implement `GET /api/safety/incidents/:id` — session
      required; ownership check; return incident with status, referenceCode,
      category
- [ ] T036 [P] [US6] Implement presigned URL endpoint
      `POST /api/safety/incidents/:id/evidence` — session required; validate
      MIME type (`image/jpeg`, `image/png`, `audio/mp4`) and max size (10 MB);
      return presigned upload URL to CDN (R2/S3); update
      `safetyIncident.evidenceUrl` on callback
- [ ] T037 [P] [US6] Build incident report form in
      `apps/mobile/rider/src/screens/SafetyReportScreen.tsx` — category picker,
      optional description, optional media attachment, submit button; show
      `referenceCode` on success

**Checkpoint**: User Story 6 complete — formal incident reporting including
critical-category auto-suspension is operational

---

## Phase 9: User Story 7 — Safety History (Priority: P3)

**Goal**: Authenticated users view their own paginated safety history
(incidents + check-ins); admins can resolve incidents.

- [ ] T038 [US7] Implement `GET /api/safety/history` in
      `api/src/routes/safety.ts` — session required; paginated query on
      `safetyIncident WHERE reporterId = userId ORDER BY createdAt DESC` (20 per
      page, cursor pagination); include `safetyCheckIn` rows linked to same
      user's trips; map to summary DTO with `referenceCode`, `type`, `status`,
      `resolvedAt`

---

## Phase 10: Admin Safety Queue (Priority: P2)

- [ ] T039 [P] Implement `GET /admin/safety/incidents` in
      `api/src/routes/admin/safety.ts` — require `role = admin`; paginated queue
      filtered by `status IN (active, open)`; ordered by `createdAt ASC`
- [ ] T040 [P] Implement `PATCH /admin/safety/incidents/:id` — admin
      resolve/acknowledge endpoint; transitions `status` to
      `resolved|acknowledged|unsubstantiated|driver_actioned`; sets
      `resolvedAt`; notify reporter via `@hakwa/notifications` push

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T041 [P] Add `SAFETY_CODE_SECRET` env var to configuration; validate on
      startup
- [ ] T042 [P] Add nightly cron in `api/src/jobs/tripShareExpiry.ts` —
      `UPDATE tripShare SET status = 'expired' WHERE status = 'active' AND expiresAt < now()`
- [ ] T043 [P] Error codes: register `SAFETY_NO_ACTIVE_TRIP`,
      `SAFETY_SOS_ALREADY_ACTIVE`, `SAFETY_CONTACT_LIMIT_REACHED`,
      `SAFETY_SHARE_EXPIRED`, `SAFETY_WRONG_MIME_TYPE` in `@hakwa/errors`

---

## Dependencies

```
Phase 1 (Schema) → Phase 2 (SMS pipeline) → Phase 3 (US1 SOS)
US4 (contacts) must be set up before US1 SOS has SMS recipients (but can be built in parallel with US1 — just not fully tested)
US2 (trip share) independent of US1 after Phase 1
US3 (vehicle verify) independent of US1 after Phase 1
US5 (check-ins) depends on Phase 2 (escalation worker)
US6 (incident report) independent after Phase 1
US7 (history) depends on Phase 3 (incidents must exist)
```

## Parallel Execution Examples

- T002 + T003 + T004 can run in parallel (separate table definitions)
- T007 + T009 can run in parallel (Twilio adapter vs check-in worker)
- T014 + T015 + T016 can run in parallel (rider SafetyPanel, silentSOS, driver
  SafetyPanel)
- T028 + T030 can run in parallel (route deviation vs stop/speed anomaly)
- T034 + T035 + T036 + T037 can run in parallel (report endpoint vs evidence vs
  UI)

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + Phase 3 + Phase 4 (T001–T019) — SOS + contact
  management (core safety is live)
- **MVP+**: Add Phase 5 + Phase 6 (T020–T027) — trip sharing + vehicle
  verification
- **Full P2**: Add Phase 7 + 8 + 10 (T028–T040) — automated check-ins + incident
  reporting + admin queue
- **Complete**: Add Phase 9 + Polish (T038, T041–T043)

**Total tasks**: 43 | **Parallelizable**: 22 | **User stories**: 7
