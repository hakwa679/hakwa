---
description: "Task list for Notification System"
---

# Tasks: Notification System

**Feature Branch**: `008-notification-system` **Input**: plan.md, spec.md,
data-model.md **Tech Stack**: TypeScript 5.x, `@expo/server-sdk`, Drizzle ORM,
PostgreSQL, Redis Streams (`notifications:outbox`), Redis pub/sub
(`user:{userId}:notifications`), `@hakwa/workers`, `@hakwa/notifications`,
`@hakwa/email`

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- All paths relative to repo root

---

## Phase 1: Setup (Schema)

**Purpose**: Define all notification tables, enums, and indexes before any code
can dispatch or persist notifications

- [ ] T001 Define `NotificationType` enum (16 values: `booking_confirmed`,
      `driver_accepted`, `driver_en_route`, `driver_arrived`, `trip_started`,
      `trip_completed`, `receipt_generated`, `wallet_credited`,
      `payout_processed`, `payout_failed`, `badge_earned`, `level_up`,
      `streak_milestone`, `referral_conversion`, `re_engagement`,
      `system_alert`) in `pkg/db/schema/notification.ts`
- [ ] T002 Define `NotificationChannel` enum (`push | in_app | email | sms`) and
      `NotificationStatus` enum (`pending | sent | failed`) and `DevicePlatform`
      enum (`ios | android`) in `pkg/db/schema/notification.ts`
- [ ] T003 Define `notification` table schema (id, userId FK→user, type,
      channel, status default `pending`, title, body, data JSONB, retryCount
      default 0, errorDetail, readAt, eventReferenceId, createdAt) in
      `pkg/db/schema/notification.ts`; add indexes: `(userId, channel, readAt)`,
      `(userId, createdAt DESC)`, and partial unique index
      `UNIQUE(userId, type, eventReferenceId) WHERE eventReferenceId IS NOT NULL`
- [ ] T004 [P] Define `device` table schema (id, userId FK→user, pushToken
      UNIQUE, platform, active default true, createdAt, updatedAt) with index
      `(userId, active)` in `pkg/db/schema/notification.ts`
- [ ] T005 [P] Define `notificationPreference` table schema (id, userId FK→user,
      type, channel, enabled default true, createdAt, updatedAt) with
      `UNIQUE(userId, type, channel)` in `pkg/db/schema/notification.ts`
- [ ] T006 Export all notification entities from `pkg/db/schema/index.ts` and
      run `db-push` to apply to database

---

## Phase 2: Foundational (Notification Pipeline)

**Purpose**: The `@hakwa/notifications` package, Redis Stream consumer, and
WebSocket relay must be live before any notification can be dispatched

**⚠️ CRITICAL**: All user story work depends on this pipeline being operational

- [ ] T007 Implement `pkg/notifications/src/expoPush.ts` —
      `batchSendPush(notifications)` calls `Expo.sendPushNotificationsAsync`;
      poll receipts after 15 s; on `DeviceNotRegistered` receipt
      `UPDATE device SET active = false WHERE pushToken = $token`
- [ ] T008 Implement `pkg/notifications/src/index.ts` — export
      `sendNotification(userId, type, payload, eventReferenceId?)`:
      idempotent-safe `INSERT INTO notification ON CONFLICT DO NOTHING`, then
      `XADD notifications:outbox '*' payload`; `sendPush`, `sendEmail`,
      `sendSms` wrappers
- [ ] T009 Implement `pkg/notifications/src/worker.ts` —
      `XREAD COUNT 100 BLOCK 0 STREAMS notifications:outbox '>'` loop; route
      each message to `expoPush.ts`, `@hakwa/email`, or SMS stub based on
      `channel`; on EPN/email success set `status = sent`; on failure increment
      `retryCount`, set `status = failed`, set `errorDetail`
- [ ] T010 Register `pkg/notifications/src/worker.ts` as a `@hakwa/workers` pool
      job in `api/src/index.ts`; start on server boot
- [ ] T011 Subscribe to `user:{userId}:notifications` Redis pub/sub in
      `api/src/websocket.ts` — relay incoming in-app notification events to the
      user's active WebSocket connection

**Checkpoint**: Pipeline operational — `sendNotification()` persists to DB,
dispatches via Redis Stream, worker delivers push/email/SMS, WebSocket relays
in-app events

---

## Phase 3: User Story 1 — Real-Time Trip Status Notifications (Priority: P1) 🎯 MVP

**Goal**: Trip state transitions (booking confirmed, driver accepted, driver
arrived, trip started, trip completed) automatically publish push + in-app
notifications to both passenger and driver.

**Independent Test**: After booking acceptance → `notification` rows created for
both passenger (channel `push` + `in_app`) and driver (channel `push` +
`in_app`); worker updates `status = sent`; WebSocket pushes in-app event to
connected clients within 3 seconds.

- [ ] T012 [US1] Add `sendNotification` calls at each trip status transition in
      `api/src/services/bookingService.ts` and
      `api/src/services/tripService.ts`: `booking_confirmed` → passenger;
      `driver_accepted` → passenger; `driver_en_route` → passenger;
      `driver_arrived` → passenger; `trip_started` → passenger + driver;
      `trip_completed` → passenger + driver
- [ ] T013 [P] [US1] Add `sendNotification` for `receipt_generated` type in
      `api/src/services/tripService.ts` after fare split commits
- [ ] T014 [P] [US1] Add `sendNotification` for `wallet_credited` type in
      `pkg/notifications` after merchant wallet ledger insert in
      `api/src/services/walletService.ts`
- [ ] T015 [P] [US1] Add `sendNotification` for `payout_processed` and
      `payout_failed` types in `pkg/workers/src/workers/payoutProcessor.ts`
      after payout status update

**Checkpoint**: User Story 1 complete — all trip lifecycle, receipt, wallet, and
payout notifications are sent and persisted

---

## Phase 4: User Story 2 — Push Delivery When App is Closed (Priority: P1)

**Goal**: Users receive push notifications when the app is in the background or
closed; tapping the notification deep-links them to the relevant screen.

**Independent Test**: A device registered with a valid Expo push token receives
a push notification while the app is backgrounded; tapping it navigates to the
active trip screen without manual navigation.

- [ ] T016 [US2] Implement `POST /api/devices` in `api/src/routes/devices.ts` —
      session required; validate `pushToken` starts with `ExponentPushToken[`
      (return 400 otherwise); upsert `device` row
      (`INSERT ... ON CONFLICT (pushToken) DO UPDATE SET updatedAt = now()`) —
      do NOT set `active = true` on conflict; a deactivated token must never be
      re-activated; the mobile app will obtain a new token from EPN and
      re-register with a fresh row
- [ ] T017 [US2] Implement `DELETE /api/devices/:id` in
      `api/src/routes/devices.ts` — session required; verify ownership; set
      `active = false` (do not hard-delete)
- [ ] T018 [P] [US2] Implement `usePushRegistration.ts` hook in
      `apps/mobile/rider/src/hooks/usePushRegistration.ts` — on app foreground,
      call `Notifications.getExpoPushTokenAsync()`; call `POST /api/devices`
      with token + platform; handle permission denied gracefully
- [ ] T019 [P] [US2] Copy `usePushRegistration.ts` pattern to
      `apps/mobile/driver/src/hooks/usePushRegistration.ts` and
      `apps/mobile/merchant/src/hooks/usePushRegistration.ts`
- [ ] T020 [P] [US2] Configure Expo deep-link handler in each mobile app
      (`app.json` scheme + `LinkingConfiguration.ts`) — map `booking`, `trip`,
      `wallet`, `badge` deep-link paths to correct screens

**Checkpoint**: User Story 2 complete — all three apps register push tokens on
launch and deep-link from notification tap works

---

## Phase 5: User Story 3 — Notification Preferences (Priority: P2)

**Goal**: Users can toggle per-type, per-channel notification preferences;
`system_alert` is always locked enabled; pipeline skips disabled channels before
dispatching.

**Independent Test**:
`PATCH /api/me/notification-preferences/wallet_credited/email` with
`{ enabled: false }` → subsequent `wallet_credited` event dispatches only
`in_app` notification, not email; `system_alert` preference update returns 403.

- [ ] T021 [US3] Seed `notificationPreference` rows (16 types × 4 channels = 64
      rows) on user registration in `pkg/auth/lib/auth.ts` inside the
      `onUserCreated` hook
- [ ] T022 [US3] Add preference check in `sendNotification()` in
      `pkg/notifications/src/index.ts` — query
      `notificationPreference WHERE userId = ? AND type = ? AND channel = ?`;
      skip dispatch if `enabled = false`; bypass check for `system_alert`
      (always dispatch)
- [ ] T023 [P] [US3] Implement `GET /api/me/notification-preferences` in
      `api/src/routes/notifications.ts` — return all 64 preference rows grouped
      by type; mark `system_alert` preferences with `locked: true`
- [ ] T024 [P] [US3] Implement
      `PATCH /api/me/notification-preferences/:type/:channel` in
      `api/src/routes/notifications.ts` — validate type is not `system_alert`
      (return 403 if so); update `enabled` in DB
- [ ] T025 [P] [US3] Build notification preferences screen in
      `apps/mobile/rider/src/screens/NotificationPreferencesScreen.tsx` —
      grouped toggles by notification type with channel columns; `system_alert`
      rows non-interactive

**Checkpoint**: User Story 3 complete — per-type per-channel preferences
enforced; system_alert always fires

---

## Phase 6: User Story 4 — In-App Notification Centre and Unread Count (Priority: P2)

**Goal**: Navigation bar shows unread count badge; notification centre lists all
in-app notifications newest-first; tapping marks as read and deep-links; new
notifications appear in real-time.

**Independent Test**: After 3 unread in-app notifications arrive → badge count
shows 3; opening notification centre shows all 3; tapping one →
`PATCH /api/notifications/:id/read` → count decrements to 2; new notification
arrives while centre is open → appends to top of list instantly.

- [ ] T026 [US4] Implement `GET /api/notifications` in
      `api/src/routes/notifications.ts` — session required; filter
      `channel = in_app AND userId = ?`; paginate by `createdAt DESC` (cursor or
      offset); include `readAt` for unread/read distinction
- [ ] T027 [US4] Implement `PATCH /api/notifications/:id/read` in
      `api/src/routes/notifications.ts` — session required; verify ownership;
      set `readAt = now()` if null
- [ ] T028 [P] [US4] Implement `POST /api/notifications/read-all` in
      `api/src/routes/notifications.ts` — session required; bulk
      `UPDATE notification SET readAt = now() WHERE userId = ? AND readAt IS NULL AND channel = 'in_app'`
- [ ] T029 [P] [US4] Maintain Redis unread counter — `INCR user:{userId}:unread`
      when in-app notification inserted; `DECR` on mark-as-read; return counter
      from `GET /api/notifications` as `unreadCount` header; WebSocket push
      updated count on change
- [ ] T030 [P] [US4] Build `NotificationsScreen.tsx` in
      `apps/mobile/rider/src/screens/NotificationsScreen.tsx` —
      `useNotifications` TanStack Query hook; skeleton list on first load;
      real-time prepend on WebSocket event; tap → mark read + deep-link
- [ ] T031 [P] [US4] Show unread badge on notification bell in navigation bar in
      all three mobile apps — subscribe to `user:{userId}:notifications`
      WebSocket event for live count updates

**Checkpoint**: User Story 4 complete — persistent in-app inbox with real-time
updates and unread badge is operational

---

## Phase 7: User Story 5 — Re-Engagement Reminder (Priority: P3)

**Goal**: A daily cron identifies passengers with no completed trip in the past
7 days and sends exactly one re-engagement push notification; completing a trip
resets the inactivity clock.

**Independent Test**: Cron runs → for each passenger with no `trip_completed`
notification in past 7 days → exactly one `re_engagement` push notification
inserted with `eventReferenceId = 're_engagement:{userId}:{weekKey}'`; partial
unique index prevents duplicates within the same week.

- [ ] T032 [US5] Implement daily re-engagement job in
      `api/src/jobs/reEngagement.ts` — query passengers where
      `MAX(tripCompletedAt)` is older than `INACTIVITY_DAYS` (default 7) or
      null; for each, call
      `sendNotification(userId, 're_engagement', { title: 'Miss us?', body: 'Book a ride...' }, eventReferenceId)`
      using `YYYY-WW` week key as `eventReferenceId` suffix; partial unique
      index handles deduplication
- [ ] T033 [US5] Schedule re-engagement job at 09:00 Fiji time daily using
      `node-cron` in `api/src/index.ts`

**Checkpoint**: User Story 5 complete — daily re-engagement push with idempotent
deduplication is operational

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T034 [P] Add `sendNotification` calls for gamification events
      (`badge_earned`, `level_up`, `streak_milestone`, `referral_conversion`) in
      `pkg/workers/src/workers/gamificationProcessor.ts`
- [ ] T035 [P] Implement EPN receipt poller in
      `pkg/notifications/src/expoPush.ts` — after 15 s delay, call
      `Expo.getPushNotificationReceiptsAsync`; for `DeviceNotRegistered`
      receipts `UPDATE device SET active = false` (token permanently dead — do
      NOT re-activate); for `error` receipts increment `retryCount` and re-queue
      to `notifications:outbox` if `retryCount < MAX_RETRY_COUNT` (constant from
      `@hakwa/notifications/src/types.ts`, default 5)
- [ ] T036 [P] Add `NotificationsScreen` deep-link entry to driver and merchant
      mobile apps matching rider pattern
- [ ] T037 [P] **[Constitution II — Type Safety]** Define Zod validation schemas
      in `pkg/notifications/src/types.ts` for all API boundaries: (1)
      `DeviceRegistrationSchema` — validates `pushToken` format + `platform`
      enum before `POST /api/devices` inserts; (2) `SendNotificationSchema` —
      validates `userId`, `type` (against `NotificationType` enum), `channel`,
      `title`, `body`, `data` shape before any `sendNotification()` call; apply
      schemas at the route handler boundary so invalid payloads are rejected
      with `400` before reaching service logic; mark Principle II satisfied in
      plan.md

---

## Dependencies

```
Phase 1 (Schema) → Phase 2 (Pipeline) → Phase 3–7 (User Stories)
US1 (trip notifications) must complete before gamification notifications (Polish T034)
US2 (device registration) is independent of US3–US5 after Phase 2
US3 (preferences) depends on Phase 2 sendNotification hook existing
US4 (notification centre) depends on Phase 2 in-app channel and Phase 3
US5 (re-engagement) depends only on Phase 2 sendNotification
```

## Parallel Execution Examples

- T004 + T005 can run in parallel (device vs preferences table)
- T007 + T008 can run in parallel (expoPush.ts vs index.ts)
- T013 + T014 + T015 can run in parallel (receipt vs wallet vs payout
  notifications)
- T018 + T019 + T020 can run in parallel (3 apps + deep-link config)
- T023 + T024 can run in parallel (GET vs PATCH preferences)
- T027 + T028 + T029 can run in parallel (read, read-all, counter)

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + Phase 3 (T001–T015) — trip lifecycle push +
  in-app delivery
- **MVP+**: Add Phase 4 (T016–T020) — Expo device registration + deep-link on
  push tap
- **Full P2**: Add Phase 5 + 6 (T021–T031) — preferences + notification centre
- **Complete**: Add Phase 7 + Polish (T032–T036)

**Total tasks**: 37 | **Parallelizable**: 17 | **User stories**: 5
