# Implementation Plan: Rider & Driver Safety System

**Feature Branch**: `010-safety-system`  
**Spec**: [spec.md](spec.md)  
**Created**: 2026-03-16

---

## Summary

Adds a layered safety system for passengers and drivers: SOS activation
(long-press + silent volume-button path), live trip sharing with trusted
contacts, automated route-deviation check-ins, and formal incident reporting.
The SOS pipeline decouples DB write from SMS dispatch via Redis Stream
`safety:sms:outbox`. Route deviation detection runs on each location update
using the trip's planned polyline. Check-in escalations are processed by a
polling worker every 15 seconds.

---

## Technical Context

| Concern                   | Resolution                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| SOS activation latency    | DB INSERT + Redis Stream publish in single request; SMS is async                                                            |
| Duplicate SOS prevention  | Redis TTL idempotency key `safety:sos_dedup:<tripId>` (60s); return existing incident with `200` and no duplicate SMS       |
| Silent SOS path           | `react-native-volume-manager` (Android) + iOS bridge; same endpoint with `silent: true`                                     |
| SMS provider              | Twilio adapter behind `SmsService` interface in `@hakwa/notifications`                                                      |
| Route deviation detection | Per-location-update polyline distance check; Redis counter `deviation:{tripId}`                                             |
| Check-in escalation       | Polling worker in `@hakwa/workers`, 15s interval; escalates after 90s                                                       |
| Trip share token          | `crypto.randomBytes(16).toString('hex')` — 128-bit entropy; never logged                                                    |
| Driver suspension         | `merchant.status = 'suspended_pending_review'` on critical incident report submission; atomic with incident insert          |
| DB schema                 | 4 new tables: `safetyIncident`, `safetyContact`, `tripShare`, `safetyCheckIn` in `pkg/db/schema/safety.ts`                  |
| Package placement         | Route handlers → `api/src/routes/safety.ts`; service logic → `api/src/services/safetyService.ts`; worker → `@hakwa/workers` |

---

## Constitution Check

| Principle                   | Ref    | Status | Notes                                                                                                                                                                       |
| --------------------------- | ------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Auth required            | FR-001 | [x]    | All safety endpoints use `requireAuth` middleware; share/:token is explicitly public                                                                                        |
| II. TypeScript strict       | FR-002 | [x]    | `SmsService` interface, `safetyIncident` types in `@hakwa/types`                                                                                                            |
| III. Drizzle schema         | FR-003 | [x]    | 4 tables in `pkg/db/schema/safety.ts`; exported from `@hakwa/db`                                                                                                            |
| IV. AppError                | FR-004 | [x]    | `SAFETY_NO_ACTIVE_TRIP`, `SAFETY_SOS_ALREADY_ACTIVE`, `SAFETY_CONTACT_LIMIT_REACHED`, etc. all defined in `@hakwa/errors`                                                   |
| V. Redis pub/sub real-time  | FR-005 | [x]    | `redis.publish('safety:sos', ...)` on SOS trigger; WebSocket server relays to safety team channel                                                                           |
| VI. Redis Stream async work | FR-006 | [x]    | SMS dispatch via `safety:sms:outbox` Redis Stream; check-in escalation via polling worker                                                                                   |
| VII. Gamification hooks     | FR-007 | [x]    | No gamification for safety events by design — no points awarded for triggering SOS                                                                                          |
| VIII. Idempotency           | FR-008 | [x]    | SOS: Redis TTL dedup key `safety:sos_dedup:<tripId>` with 60-second idempotency window; formal reports: `UNIQUE(tripId, reporterId, type)`                                  |
| IX. Cursor pagination       | FR-009 | [x]    | `GET /incidents` paginates by `createdAt` cursor                                                                                                                            |
| X. Worker CPU offload       | FR-010 | [x]    | Check-in escalation polling worker in `@hakwa/workers`; SMS worker also in workers package                                                                                  |
| XI. AppError codes          | FR-011 | [x]    | All 13 error codes defined in contracts/rest-api.md; registered in `@hakwa/errors`                                                                                          |
| XII. Mobile sessions        | FR-012 | [x]    | Session read via `getSessionFromRequest`; silent SOS path reuses same auth token                                                                                            |
| XIII. Fare integrity        | FR-013 | N/A    | Safety does not touch fare ledger                                                                                                                                           |
| XIV. Notifications          | FR-014 | [x]    | Push notification on check-in prompt; SMS via Twilio on SOS; fallback push if SMS fails                                                                                     |
| XV. Map integration         | FR-015 | [x]    | Location snapshot stored as GeoJSON in `locationSnapshotJson`; live-share reads from Redis location hash                                                                    |
| XVI. ODbL compliance        | FR-016 | N/A    | No map feature contributions in safety system                                                                                                                               |
| XVII. Schema migrations     | FR-017 | [x]    | `db-push` applies safety tables; `merchantStatusEnum` extended additively                                                                                                   |
| XVIII. Official Docs First  | FR-018 | [x]    | Twilio SMS API, `crypto.randomBytes` usage, and `expo-location` accuracy constants verified against official docs before implementation; no API shapes assumed from memory. |

---

## Project Structure

```
pkg/
  db/
    schema/
      safety.ts         ← safetyIncident, safetyContact, tripShare, safetyCheckIn
  notifications/
    src/
      adapters/
        twilio.ts        ← TwilioSmsAdapter implements SmsService
      templates/
        sos-sms.ts       ← buildSosSms()

api/
  src/
    routes/
      safety.ts          ← all /api/v1/safety/* routes
    services/
      safetyService.ts   ← triggerSOS, addContact, createShare, fileReport, etc.
      locationService.ts ← checkRouteDeviation() added to existing location update handler
    workers/
      checkInEscalation.ts  ← 15-second polling worker; creates safetyIncident on timeout
      smsSender.ts          ← XREAD from safety:sms:outbox; dispatches via TwilioSmsAdapter

apps/
  mobile/
    passenger/
      src/
        screens/
          ActiveTrip/
            SafetyPanel.tsx    ← shield icon long-press (2s) → countdown overlay → triggerSOS()
        hooks/
          useSilentSOS.ts      ← volume button listener → triggerSOS({ silent: true })
        screens/
          Settings/
            EmergencyContacts.tsx
    driver/
      src/
        screens/
          ActiveTrip/
            SafetyPanel.tsx    ← mirror of passenger panel with driver-specific framing
```
