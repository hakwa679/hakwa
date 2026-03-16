# Implementation Plan: Notification System

**Branch**: `008-notification-system` | **Date**: 2026-03-16 | **Spec**:
[spec.md](./spec.md) **Input**: Feature specification from
`/specs/008-notification-system/spec.md`

## Summary

A multi-channel notification system delivering push (via Expo EPN), in-app (via
WebSocket), email, and SMS notifications across all platform events — trip
lifecycle (13 event types), financial events, gamification milestones, and
re-engagement reminders. Notifications are persisted before dispatch; delivery
is fully asynchronous via a Redis Streams → `@hakwa/workers` worker pipeline.
User preferences are enforced per type-and-channel. A new `@hakwa/notifications`
workspace package centralises all sender adapters, the dispatch orchestrator,
retry/back-off helpers, and payload builders. New DB tables (`notification`,
`device`, `notificationPreference`) are added to
`pkg/db/schema/notification.ts`. The API exposes CRUD endpoints for notification
history, unread counts, device registration, and preference management. Frontend
surfaces include a notification centre (paginated list), unread badge, and
preference settings screen.

## Technical Context

**Language/Version**: TypeScript 5.x strict mode, Node.js 22.x LTS  
**Primary Dependencies**: Drizzle ORM, `@expo/server-sdk` (Expo EPN),
`@hakwa/redis` (Redis Streams), `@hakwa/workers` (worker threads),
`@hakwa/email`, `@hakwa/errors`, `@hakwa/types`, `@hakwa/api-client`  
**Storage**: PostgreSQL via Drizzle — three new tables: `notification`,
`device`, `notification_preference`  
**Testing**: Vitest (unit + integration); notification dispatch mocked at sender
adapter boundary  
**Target Platform**: Linux server (API worker), React Native Expo (mobile push +
notification centre), React/Vite (web notification centre)  
**Project Type**: API feature + shared package (`@hakwa/notifications`) +
frontend screens  
**Performance Goals**: Notification delivered to client within 3 seconds of the
triggering event (SC-001); unread count updated within 1 second of mark-as-read
(SC-004)  
**Constraints**: Dispatch MUST NOT block the HTTP request path; push tokens
invalidated immediately on EPN rejection; retry up to configurable max with
exponential back-off; `system_alert` non-opt-outable; idempotency enforced via
`eventReferenceId`  
**Scale/Scope**: All user types (passenger, driver, merchant); 16 notification
types; 4 channels; daily inactivity job covering all passengers

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **I. Package-First** — New `@hakwa/notifications` package in
      `pkg/notifications/`; new DB schema in `pkg/db/schema/notification.ts`; no
      notification logic inlined in `api/` or `apps/`.
- [x] **II. Type Safety** — All DB types from Drizzle
      `$inferSelect`/`$inferInsert`; notification payloads validated at API
      boundary (Zod); `any` forbidden.
- [x] **III. Security** — WebSocket notification delivery uses existing
      `getSessionFromRequest` auth; push tokens stored server-side only;
      SMS/email provider keys from env vars; `eventReferenceId` prevents
      injection via duplicated events.
- [x] **IV. Schema Contract** — `notification`, `device`,
      `notification_preference` tables defined in
      `pkg/db/schema/notification.ts` and exported through `@hakwa/db` before
      any service code consumes them.
- [x] **V. Real-Time** — In-app notifications delivered via Redis pub/sub →
      WebSocket worker fan-out (Principle V architecture); no DB polling;
      heartbeat maintained per existing ws server config.
- [x] **VI. Redis Package** — Redis Streams and pub/sub accessed exclusively via
      `@hakwa/redis`; `REDIS_URL` from env.
- [x] **VIII. Concurrency Safety** — `eventReferenceId` unique constraint on
      `notification` table enforces idempotency for double-fired events (FR-013,
      FR-014); push token deactivation is idempotent (UPDATE WHERE active =
      true); notification status transitions use conditional UPDATE
      (`WHERE status = 'pending'`).
- [x] **IX. Webhook-First** — All post-commit notification triggers dispatched
      via Redis Stream event (never inlined in the primary transaction); stream
      consumer is idempotent; delivery worker retries with exponential back-off
      per outbound webhook pattern.
- [x] **X. Worker-Thread Concurrency** — Notification delivery worker runs in
      `@hakwa/workers` pool; stream consumption, preference lookup, and all
      channel sends happen off the main thread; worker does not import Express
      or WebSocket singletons.
- [x] **XI. Unified Error Handling** — Sender adapter failures surfaced as
      `AppError` from `@hakwa/errors`; worker errors serialised and propagated
      through pool; API route errors handled by central Express error
      middleware; WebSocket delivery errors use
      `{ type: "error", code, message }` envelope.
- [x] **XII. Frontend Architecture** — `NotificationType`,
      `NotificationChannel`, `NotificationRecord`, `DeviceRegistration`,
      `NotificationPreference` types defined in `@hakwa/types`; query hooks
      (`useNotifications`, `useUnreadCount`, `useNotificationPreferences`) in
      `@hakwa/api-client`; no hardcoded URLs; mobile via `EXPO_PUBLIC_*`, web
      via `VITE_*`.
- [x] **XIII. Shared-First Reuse** — Notification service logic in
      `api/src/services/notification-service.ts`; all channel senders in
      `@hakwa/notifications` (not per-app); notification centre UI components in
      `@hakwa/ui-native` / `@hakwa/ui-web`.
- [x] **XIV. Notification System** _(this feature delivers the system)_ —
      Persisted before dispatch ✓; Redis Stream → worker ✓; `device` table for
      push tokens ✓; preferences respected (except `system_alert`) ✓; all 13
      platform triggers ✓; `@hakwa/notifications` as sole send path ✓; retry
      with back-off ✓.
- [x] **XV. UI Design System** — Notification centre and preference screens use
      `@hakwa/tokens` slate palette; unread badge uses `color.accent`;
      read/unread states from token system; touch targets ≥ 44 × 44 pt; loading
      skeletons for async list.
- [x] **XVI. UX Principles** — Optimistic mark-as-read (count decrements
      immediately); skeleton screens on notification centre open; three states
      per async op; empty state with CTA ("You're all caught up"); unread count
      badge visible in nav bar at all times; preference toggles use verb-first
      labels ("Receive push notifications for…"); `system_alert` shown as locked
      with reason.

## Project Structure

### Documentation (this feature)

```text
specs/008-notification-system/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
pkg/
├── notifications/           # NEW — @hakwa/notifications
│   ├── package.json
│   ├── index.ts
│   └── src/
│       ├── types.ts         # NotificationType enum, channel enum, payload builders
│       ├── dispatch.ts      # dispatchNotification() orchestrator
│       ├── preferences.ts   # loadUserPreferences(), shouldSendToChannel()
│       ├── retry.ts         # exponential back-off helpers, MAX_RETRY_COUNT constant
│       └── senders/
│           ├── push.ts      # Expo EPN adapter (expo-server-sdk)
│           ├── in-app.ts    # Redis pub/sub → WebSocket fan-out adapter
│           ├── email.ts     # @hakwa/email adapter
│           └── sms.ts       # SMS gateway adapter (env-driven provider)
└── db/
    └── schema/
        └── notification.ts  # NEW — notification, device, notificationPreference tables

api/src/
├── routes/
│   ├── notifications.ts     # GET /notifications, PATCH /:id/read, GET /unread-count
│   └── devices.ts           # POST /devices, DELETE /devices/:id
├── services/
│   ├── notification-service.ts  # createAndDispatch(), triggerNotification()
│   └── inactivity-job.ts        # Daily re-engagement cron
└── workers/
    └── notification-worker.ts   # Redis Stream consumer (runs in @hakwa/workers pool)

apps/mobile/rider/src/
├── screens/
│   ├── NotificationCentreScreen.tsx
│   └── NotificationPreferencesScreen.tsx
└── components/
    └── UnreadBadge.tsx       # (or extracted to @hakwa/ui-native if shareable)

apps/mobile/driver/src/
└── screens/
    └── NotificationCentreScreen.tsx   # Same screens mirrored for driver app

apps/web/src/
└── pages/
    ├── notifications/index.tsx        # Notification centre for web
    └── settings/notifications.tsx     # Preference settings page
```

**Structure Decision**: Option 3 (Mobile + API) extended with shared package.
The `@hakwa/notifications` package owns all delivery logic; `api/` owns HTTP
routes and the stream-producing service; mobile/web apps own their notification
UI screens.

## Complexity Tracking

> No Constitution Check violations. All constraints satisfied by the
> package-first and async-dispatch architecture already mandated by the
> constitution.
