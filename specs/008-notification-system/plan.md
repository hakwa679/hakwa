# Implementation Plan: Notification System

**Branch**: `008-notification-system` | **Date**: 2026-03-17 | **Spec**:
[spec.md](spec.md)  
**Input**: Feature specification from `/specs/008-notification-system/spec.md`

---

## Summary

Multi-channel notification system (push, in-app, email, SMS) built on three
pillars: Expo Push Notification Service (`expo-server-sdk`) for mobile push
delivery, Redis Streams for async dispatch, and a `notification` + `device`
schema for persistence and audit. Push tokens are registered per-device and
automatically deactivated on `DeviceNotRegistered` EPN receipts. In-app
notifications are delivered via WebSocket pub/sub
(`user:{userId}:notifications`) with unread counts. Email notifications flow via
`@hakwa/email` through the existing Redis Stream outbox. A partial unique index
on `(userId, type, eventReferenceId)` enforces idempotency for event-triggered
notifications.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: `expo-server-sdk`, `@hakwa/db`, `@hakwa/redis`,
`@hakwa/email`, `@hakwa/errors`, `ws`  
**Storage**: PostgreSQL (`notification`, `device` tables in
`pkg/db/schema/notification.ts`); Redis (dispatch Stream `notifications:outbox`,
in-app pub/sub `user:{userId}:notifications`)  
**Testing**: Vitest; mock `expo-server-sdk` Expo.sendPushNotificationsAsync;
mock Redis Stream consumer  
**Target Platform**: Node.js API; React Native Expo (Rider, Driver, Merchant
apps); React + Vite (web portals)  
**Project Type**: Monorepo — shared `@hakwa/notifications` package + API
routes + mobile/web consumers  
**Performance Goals**: Push dispatch < 2 s after event; in-app delivery < 500
ms; batch size ≤ 100 tokens per EPN request  
**Constraints**: No polling for in-app notifications; push tokens deactivated
immediately on invalidation; idempotent notification creation  
**Scale/Scope**: Phase 1 — thousands of devices; Expo EPN batching handles
concurrent dispatch; single consumer worker for Phase 1

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **I. Package-First** — `@hakwa/notifications` package scaffolded in T000
      before any shared logic is written; consumed via workspace import only.
- [x] **II. Type Safety** — No `any` without justification; DB types derived
      from Drizzle `$inferSelect`/`$inferInsert`; external inputs validated at
      boundary (T037 adds Zod schemas in Phase 2 before any route handler goes
      live).
- [x] **III. Security** — Push token registration requires session auth;
      `POST /devices` validates token format; device row ownership enforced;
      WebSocket notification channel scoped to `user:{userId}`.
- [x] **IV. Schema Contract** — `notification` and `device` tables defined in
      `pkg/db/schema/notification.ts`; `db-push` run before consuming code;
      partial unique index for idempotency.
- [x] **V. Real-Time** — In-app notifications published to Redis
      `user:{userId}:notifications` pub/sub; WebSocket server relays to
      connected clients; unread count maintained via Redis counter; no DB
      polling.
- [x] **VI. Redis Package** — All Redis ops via `@hakwa/redis`; `REDIS_URL` env;
      `XADD` to `notifications:outbox` Stream; pub/sub publish via wrapper.
- [x] **VIII. Concurrency Safety** — Notification creation idempotent via
      `UNIQUE (userId, type, eventReferenceId)` partial index; push token
      deactivation via `UPDATE ... WHERE pushToken = $token` is safe (no
      read-modify-write).
- [x] **IX. Webhook-First** — Notification dispatch is async via Redis Stream
      `notifications:outbox`; worker processes and retries; no inline dispatch
      inside business transactions.
- [x] **X. Worker-Thread Concurrency** — EPN batch calls and email sends run
      inside `@hakwa/workers` pool; the main event loop only writes to the Redis
      Stream.
- [x] **XI. Unified Error Handling** — Worker catches failed EPN receipts
      per-token; `DeviceNotRegistered` deactivates token; other failures
      increment `retryCount`; `AppError` from `@hakwa/errors` used throughout.
- [x] **XII. Frontend Architecture** — Mobile apps register push tokens on
      launch via `@hakwa/api-client`; in-app notification centre via TanStack
      Query `useNotifications`; WebSocket hook from `@hakwa/api-client`;
      `EXPO_PUBLIC_*` env vars.
- [x] **XIII. Shared-First Reuse** — All notification dispatch via
      `@hakwa/notifications` package; no inline
      `Expo.sendPushNotificationsAsync` outside the package.
- [x] **XIV. Notification System** ✅ — This feature implements principle XIV
      directly: persisted records, Redis Stream dispatch, device table,
      preference support (future), EPN integration, retry with back-off.
- [x] **XV. UI Design System** — Notification centre uses `@hakwa/ui-native`
      list components; unread badge from `@hakwa/tokens` colours; dark mode
      primary.
- [x] **XVI. UX Principles** — Unread count badge on notification bell;
      optimistic mark-as-read; skeleton list on first load; deep-link from push
      tap.
- [ ] **XVII. Mapping** — N/A. No map UI in this feature.
- [x] **XVIII. Official Documentation First** — `expo-server-sdk` (correct
      package name and v6 API), `expo-notifications` token registration API, and
      Redis Streams consumer group commands verified against official docs
      before implementation.

## Project Structure

### Documentation (this feature)

```text
specs/008-notification-system/
├── plan.md          ← this file
├── research.md      ← EPN choice, Redis Streams, idempotency index, in-app pub/sub
├── data-model.md    ← notification + device tables, enums, indexes, Redis structures
├── quickstart.md    ← schema → @hakwa/notifications package → device routes → websocket → verify
└── contracts/
    ├── rest-api.md  ← device registration, notification CRUD, preferences
    └── websocket.md ← in-app event envelope, unread count, mark-as-read
```

### Source Code

```text
pkg/
├── db/schema/notification.ts        ← notification, device tables exported via @hakwa/db
└── notifications/src/
    ├── index.ts                     ← sendNotification(), sendPush(), sendEmail(), sendSms()
    ├── expoPush.ts                  ← expo-server-sdk batch send + receipt handler
    └── worker.ts                    ← Redis Stream consumer (notifications:outbox)

api/
└── src/
    ├── routes/
    │   ├── devices.ts               ← POST /devices, DELETE /devices/:id
    │   └── notifications.ts         ← GET /notifications, PATCH /:id/read, POST /read-all
    └── websocket.ts                 ← user:{userId}:notifications subscription

apps/
└── mobile/
    └── */src/
        ├── hooks/usePushRegistration.ts   ← token registration on app launch
        └── screens/NotificationsScreen.tsx ← notification centre UI
```
