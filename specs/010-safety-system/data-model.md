# Data Model: Rider & Driver Safety System

**Feature**: 010-safety-system  
**Schema file**: `pkg/db/schema/safety.ts`  
**Last updated**: 2026-03-16

---

## Overview

Four new tables are introduced. All live in `pkg/db/schema/safety.ts` and are
exported through `@hakwa/db`.

No existing tables are structurally altered. The only change to existing tables
is:

- `merchant.status` gains the value `"suspended_pending_review"` (additive enum
  extension) — used when a critical-category incident report triggers automatic
  driver suspension (FR-018).

---

## New Tables

### `safety_incident`

The central record for every safety event on the platform: SOS activations,
wrong-vehicle flags, check-in escalations, and formal incident reports filed by
passengers or drivers.

```
safety_incident
├── id                   uuid          PK, random
├── reference_code       varchar(15)   UNIQUE NOT NULL — "SAF-YYMMDD-XXXX" human-readable ID
├── reporter_id          text          FK → user.id (SET NULL on DELETE — preserve record)
├── subject_id           text          nullable — FK → user.id — the other party (driver or passenger)
│                                      SET NULL on DELETE
├── trip_id              uuid          nullable — FK → trip.id (SET NULL on DELETE)
├── type                 text          "sos" | "wrong_vehicle" | "route_deviation_escalation" |
│                                      "speed_anomaly_escalation" | "stop_anomaly_escalation" |
│                                      "formal_report"
├── category             text          nullable — only for type = "formal_report"
│                                      "assault" | "inappropriate_behaviour" | "wrong_vehicle" |
│                                      "dangerous_driving" | "verbal_abuse" | "overcharge" |
│                                      "no_show" | "other"
├── reporter_role        text          "passenger" | "driver" — role of the reporter at incident time
├── status               text          "active" | "acknowledged" | "open" | "resolved" |
│                                      "unsubstantiated" | "driver_actioned"
├── location_snapshot_json  text       nullable — GeoJSON Point of last known location at incident time
├── description          text          nullable — free-text detail from reporter (formal reports)
├── evidence_url         text          nullable — CDN URL of uploaded photo or audio (FR-020)
├── resolution_notes     text          nullable — admin-written resolution summary
├── sms_dispatched_at    timestamp     nullable — when the SOS SMS was actually sent
├── sms_failed           boolean       default false — set true if all SMS attempts failed
├── created_at           timestamp     not null, default now()
├── updated_at           timestamp     not null, default now()
└── resolved_at          timestamp     nullable — set when status → "resolved" / "unsubstantiated" /
                                        "driver_actioned"
```

**Indexes**:

- B-tree on `reporter_id` (history queries per user)
- B-tree on `trip_id` (trip-level safety audit)
- B-tree on `status` (safety team queue: filter `open`, `active`)
- B-tree on `created_at` (recency ordering)
- UNIQUE on `reference_code`

**Notes**:

- `reporter_id` and `subject_id` use `SET NULL` on delete rather than cascade so
  the safety record survives account deletion (GDPR/safety audit compliance).
- A single trip can have multiple incidents (e.g., an SOS followed by a formal
  report). There is no uniqueness constraint on `(trip_id, type)`.

---

### `safety_contact`

Emergency contacts registered by a user. Notified by SMS when an SOS fires or a
check-in escalates.

```
safety_contact
├── id          uuid          PK, random
├── user_id     text          FK → user.id (CASCADE DELETE)
├── name        varchar(80)   Display name — e.g., "Mum"
├── phone       varchar(20)   E.164 normalised phone number — e.g., "+6799123456"
├── label       varchar(30)   nullable — relationship label — e.g., "Sister"
├── is_active   boolean       default true — set false to soft-disable without deleting
├── created_at  timestamp     not null, default now()
└── updated_at  timestamp     not null, default now()
```

**Constraints**:

- Application enforces max 3 rows where `is_active = true` per `user_id`.
- Phone stored in E.164 to ensure unambiguous international dialling for Fiji
  numbers and diaspora contacts.

**Indexes**:

- B-tree on `user_id` (primary lookup when dispatching SOS SMS)
- B-tree on `(user_id, is_active)` (filter active contacts only)

---

### `trip_share`

Live-share sessions that allow a trusted third party to track an active trip in
real time via a public browser link. No Hakwa account required to view.

```
trip_share
├── id           uuid          PK, random
├── trip_id      uuid          FK → trip.id (CASCADE DELETE)
├── created_by   text          FK → user.id (SET NULL on DELETE)
├── token        varchar(64)   UNIQUE NOT NULL — URL-safe random token (min 128-bit entropy)
├── status       text          "active" | "expired" | "revoked"
├── created_at   timestamp     not null, default now()
├── expires_at   timestamp     not null — trip.completedAt + 15 min, estimated if not yet complete;
│                              updated when trip.completedAt is set
└── revoked_at   timestamp     nullable — set when the passenger taps "Stop sharing"
```

**Constraints**:

- At most one `active` share per trip at a time. Creating a new share while one
  is already `active` revokes the previous one (token rotation on re-share).
- UNIQUE on `token` — enforced at DB level.

**Indexes**:

- B-tree on `token` (primary lookup on the public share endpoint — hot path)
- B-tree on `trip_id` (check for existing active share)
- B-tree on `expires_at` (cleanup job scanning for expired shares)

**Security note**: `token` MUST NOT be logged in access logs. The cleanup job
MUST NOT expose tokens in any observable output. The random token column has a
`default gen_random_uuid()::text` substituted with a proper 128-bit random
string generated by the application layer — not a UUID (which has lower entropy
in some Postgres versions).

---

### `safety_check_in`

Server-generated check-in prompts triggered by the anomaly detector during
`in_progress` trips. Tracks the 90-second response window and escalation state.

```
safety_check_in
├── id                  uuid          PK, random
├── trip_id             uuid          FK → trip.id (CASCADE DELETE)
├── user_id             text          FK → user.id (SET NULL on DELETE) — the user prompted
├── type                text          "route_deviation" | "speed_anomaly" | "prolonged_stop"
├── status              text          "pending" | "ok_confirmed" | "escalated" | "cancelled" |
│                                     "trip_ended"
├── anomaly_detail_json text          nullable — snapshot of the anomaly data (e.g., deviation
│                                     distance and duration) stored as JSON string
├── prompted_at         timestamp     not null — when the check-in prompt was sent
├── responded_at        timestamp     nullable — when the user tapped "I'm OK" or "Cancel alert"
├── escalated_at        timestamp     nullable — when the 90-second timer fired
├── incident_id         uuid          nullable — FK → safety_incident.id (SET NULL on DELETE)
│                                     populated when escalation creates an incident row
├── created_at          timestamp     not null, default now()
└── updated_at          timestamp     not null, default now()
```

**Constraints**:

- `UNIQUE (trip_id, type)` within a 20-minute cooldown window — enforced at the
  application layer (not a DB constraint, because a second anomaly of the same
  type is allowed after the cooldown expires). The cooldown is tracked in Redis:
  `safety:anomaly_cooldown:<tripId>:<type>` with a 20-minute TTL.

**Indexes**:

- B-tree on `trip_id` (query active check-ins for a trip)
- B-tree on `user_id` (history queries)
- B-tree on `status` WHERE `status = 'pending'` (partial index — escalation
  worker scans only pending check-ins)

---

## Redis Keys

The anomaly and escalation systems use Redis for short-lived state that must
survive API-server restarts and be shared across API instances.

| Key Pattern                               | TTL        | Purpose                                                                                  |
| ----------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `safety:anomaly_cooldown:<tripId>:<type>` | 20 minutes | Suppresses duplicate check-ins for the same anomaly type on the same trip                |
| `safety:checkin:<checkInId>:expiry`       | 90 seconds | Escalation timer. When the key expires, a worker promotes the check-in to `escalated`    |
| `safety:sos_dedup:<tripId>`               | 60 seconds | Deduplication key for rapid-repeat SOS triggers on the same trip (FR-025)                |
| `safety:share_sse:<token>`                | (none)     | SSE connection registry; used by fan-out workers to push GPS updates to open SSE clients |

---

## Schema Extension: `merchant.status`

The existing `merchant.status` text column in `pkg/db/schema/merchant.ts` gains
one additional valid value:

- `"suspended_pending_review"` — set atomically when a critical-category
  incident report is filed (FR-018). The driver cannot accept bookings while in
  this state. The safety team resolves back to `active` or permanently
  `suspended`.

No column is added or removed. Drizzle enum validation is updated to accept this
value. All existing query paths that check `status = 'active'` already correctly
exclude this new status.

---

## Relationships Diagram (text)

```
user ──< safety_contact           (1 user : N contacts)
user ──< safety_incident          (as reporter_id)
user ──< safety_incident          (as subject_id)
user ──< trip_share               (as created_by)
user ──< safety_check_in          (as user_id)

trip ──< safety_incident          (1 trip : N incidents)
trip ──< trip_share               (1 trip : 1 active share at a time)
trip ──< safety_check_in          (1 trip : N check-ins)

safety_check_in ──> safety_incident  (escalation links to the created incident)
```
