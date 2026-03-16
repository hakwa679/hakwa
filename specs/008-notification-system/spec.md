# Feature Specification: Notification System

**Feature Branch**: `008-notification-system`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: Multi-channel notification system covering push, in-app, email, and
SMS channels, notification preferences, delivery pipeline, unread counts, and
all platform notification types across trip lifecycle, financial events, and
gamification

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Receive Real-Time Trip Status Notifications (Priority: P1)

Throughout the trip lifecycle — booking confirmed, driver accepted, driver en
route, driver arrived, trip started, trip completed — the passenger receives
timely push notifications and in-app messages. The driver receives matching
notifications on their side (booking request, passenger confirmed, trip
completed).

**Why this priority**: Trip status notifications are the primary real-time
interface between the system and its users. Missing or delayed notifications
directly degrade the trip experience.

**Independent Test**: A passenger with an active booking can receive in-app
notifications for each status transition (accepted → driver_arrived →
in_progress → completed) without navigating to any particular screen —
independently of email and SMS channels.

**Acceptance Scenarios**:

1. **Given** a passenger with a confirmed booking, **When** a driver accepts the
   booking, **Then** the passenger receives a push notification and an in-app
   message within 3 seconds showing the driver's name and ETA.
2. **Given** a driver who has accepted a booking, **When** they mark "Arrived",
   **Then** the passenger receives a "Your driver has arrived" push and in-app
   notification with a sound/vibration alert.
3. **Given** a passenger with an active trip, **When** the trip is completed,
   **Then** they receive a "Trip completed" notification with the final fare and
   a prompt to review.
4. **Given** a driver app, **When** a booking request is dispatched to them,
   **Then** a push notification AND an in-app alert arrive within 3 seconds.

---

### User Story 2 - Notification Delivered While App is Closed (Priority: P1)

A passenger or driver who has closed their app still receives push notifications
for critical trip events, so they are not left uninformed when the app is in the
background.

**Why this priority**: Most trip interactions happen with the app backgrounded
or closed. Push delivery to background/closed apps is the primary engagement
channel.

**Independent Test**: A passenger who has locked their device and has the app in
the background receives a push notification for a booking acceptance —
independently of the in-app channel.

**Acceptance Scenarios**:

1. **Given** a passenger with a closed app, **When** a driver accepts their
   booking, **Then** a push notification appears on their device lock screen
   within 5 seconds.
2. **Given** a push notification tapped by the user, **When** the app opens,
   **Then** the user is deep-linked directly to the relevant screen (active
   trip, wallet, badge earned) without needing to navigate manually.

---

### User Story 3 - Manage Notification Preferences (Priority: P2)

A user can control which notification types they receive and on which channels.
For example, a merchant may want wallet-credited notifications only via in-app
and not by email. Preferences are respected by the delivery pipeline. Critical
system alerts cannot be disabled.

**Why this priority**: Notification fatigue causes app uninstalls. User control
over channels preserves app retention.

**Independent Test**: A user who disables email for `wallet_credited`
notifications no longer receives emails for that type, but still receives in-app
notifications — independently of other notification types.

**Acceptance Scenarios**:

1. **Given** the notification preferences screen, **When** a user disables a
   channel for a specific notification type, **Then** the change is saved and
   respected from the next delivery.
2. **Given** a `system_alert` notification type, **When** the user attempts to
   disable it, **Then** the preference screen shows it as locked ("Required —
   cannot be disabled") and the toggle is not interactive.
3. **Given** a user who has opted out of email for `wallet_credited`, **When** a
   trip is completed and their wallet is credited, **Then** no email is sent but
   the in-app notification is delivered normally.

---

### User Story 4 - In-App Notification Centre and Unread Count (Priority: P2)

A user can open their notification centre in the app and see all past
notifications. Unread notifications are visually distinct. The navigation bar
shows an unread count badge. Tapping a notification marks it as read and
deep-links to the relevant content.

**Why this priority**: Not all push notifications are seen immediately. An
in-app inbox gives users a persistent record and ensures nothing is missed.

**Independent Test**: A user with unread notifications sees a count badge in the
navigation bar; opening the notification centre shows the list; tapping a
notification marks it read and updates the count.

**Acceptance Scenarios**:

1. **Given** an authenticated user with unread notifications, **When** they view
   any primary screen, **Then** the navigation bar shows an unread count badge
   matching the number of unread notifications.
2. **Given** the notification centre open, **When** the user taps an unread
   notification, **Then** it is marked as read, the unread count decrements, and
   the user is navigated to the relevant screen (deep-link).
3. **Given** the notification centre, **When** a new notification arrives while
   the centre is open, **Then** it appears at the top of the list in real time
   without a manual refresh.

---

### User Story 5 - Re-Engagement Reminder for Inactive Passengers (Priority: P3)

A passenger who has not taken a trip in the past 7 days (configurable) receives
a re-engagement push notification with a call to action to book a ride.

**Why this priority**: Re-engagement nudges recapture lapsed users. Automated
triggers reduce manual marketing effort.

**Independent Test**: A passenger with no trip activity for the configured
inactivity period receives exactly one re-engagement push notification when the
reminder job runs.

**Acceptance Scenarios**:

1. **Given** a passenger with no completed trips in the past 7 days, **When**
   the daily inactivity check runs, **Then** they receive a re-engagement push
   notification with a "Book a ride" call to action.
2. **Given** a passenger who books a trip after receiving a re-engagement
   notification, **When** their trip is completed, **Then** the inactivity clock
   resets and no further re-engagement notifications are sent until the next
   inactivity period elapses.

---

### Edge Cases

- What if a push token is expired or invalid? The delivery pipeline MUST mark
  the device as inactive and NOT retry with a dead token. The user still
  receives in-app notifications via WebSocket when they next open the app.
- What if the user has no registered push token (never granted permission)? Push
  notifications are skipped for that user. In-app and email channels are
  unaffected.
- What if a notification is sent but delivery fails for all channels? The
  `notification` record is updated to `failed` with error details. A retry is
  scheduled with exponential back-off up to the configured maximum.
- What if the same event fires twice (e.g., webhook duplicate delivery)? The
  notification should be created only once per event. Idempotency is enforced
  via the triggering event's reference ID.
- What if a user has 1,000+ unread notifications? The notification centre
  paginates. The unread count caps display at "99+" to avoid layout overflow.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Every notification MUST be persisted as a `notification` record
  before dispatch: `userId`, `type` (closed enum), `channel` (`push` | `in_app`
  | `email` | `sms`), `title`, `body`, `data` (JSON deep-link context), `status`
  (`pending` → `sent` | `failed`), `readAt`, `createdAt`.
- **FR-002**: Notification types MUST be a closed enum in the schema. New types
  MUST be added to the enum, never stored as free strings.
- **FR-003**: Notification dispatch MUST be fully asynchronous: the triggering
  service writes a `notification` record and publishes a dispatch event. The
  sending happens off the critical path — the triggering request MUST NOT block
  on delivery.
- **FR-004**: The delivery pipeline MUST check user preferences before
  dispatching to any channel. An opted-out channel for a given type MUST be
  skipped, except for `system_alert` which is non-opt-outable.
- **FR-005**: `system_alert` notification type MUST be delivered regardless of
  user preference settings. It MUST NOT have a disable option in the preferences
  UI.
- **FR-006**: Push notifications MUST include a `data` payload with enough
  context for the app to deep-link to the correct screen on open — no additional
  API call required for navigation.
- **FR-007**: Invalid or expired push tokens returned by the push provider MUST
  be marked inactive in the `device` table immediately — they MUST NOT be
  retried.
- **FR-008**: Failed push and SMS notifications MUST be retried with exponential
  back-off up to a configurable maximum retry count.
- **FR-009**: In-app notifications MUST be delivered via the platform's
  real-time WebSocket channel. Connected users MUST receive in-app notifications
  as they are created, without refreshing.
- **FR-010**: The authenticated user's unread notification count MUST be
  accessible from any primary screen at all times — embedded in the primary
  navigation.
- **FR-011**: Marking a notification as read MUST update `readAt` and be
  immediately reflected in the unread count.
- **FR-012**: Every user MUST be able to manage their notification preferences
  at the type-and-channel level. The preferences MUST be persisted and respected
  from the next delivery.
- **FR-013**: The following platform events MUST automatically trigger
  notifications (no manual action required): booking confirmed, driver accepted,
  driver en route, driver arrived, trip started, trip completed, receipt
  generated, wallet credited, payout processed, payout failed, badge earned,
  level-up, streak milestone, referral conversion.
- **FR-014**: A daily inactivity job MUST send a re-engagement push notification
  to passengers with no completed trips in the past N days, where N is a named
  constant (default 7).
- **FR-015**: Every notification dispatch attempt MUST be logged with the user
  ID, channel, status, and any error reason.

### Key Entities

- **Notification**: The persisted record for every notification. See FR-001 for
  full field list.
- **Device**: Stores a user's push token(s). A user may have multiple active
  tokens (multiple devices). Holds `userId`, `pushToken`, `platform` (`ios` |
  `android`), `active` status.
- **NotificationPreference**: One row per user per notification type per
  channel. Holds `userId`, `type`, `channel`, `enabled` (boolean). Defaults to
  enabled for all types and channels on account creation.

### Assumptions

- Phone number collection for SMS is optional for passengers at registration
  (covered in the User Registration spec). If no phone number is on file, SMS is
  skipped for that user regardless of preferences.
- Email and SMS sending providers are configured via environment variables. The
  spec does not prescribe which providers are used.
- In-app notification history is retained for 90 days. Older records are
  archived or deleted according to a data retention policy (out of scope for
  this spec).
- Re-engagement notifications are only sent once per inactivity window. Multiple
  firings of the job for the same user within the same window MUST be
  idempotent.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Trip status notifications (booking accepted, driver arrived, trip
  completed) are delivered to the passenger within 3 seconds of the status
  change, for users with the app open or backgrounded on a stable connection.
- **SC-002**: 100% of notification records have a corresponding `sent` or
  `failed` status — zero notifications remain in `pending` state after the
  delivery pipeline processes them.
- **SC-003**: Zero notifications are sent to a channel that a user has opted out
  of — validated by automated preference-enforcement tests.
- **SC-004**: Unread count is accurate within 1 second of a notification being
  marked read, for users with the app open.
- **SC-005**: Zero duplicate notifications from double-fired events —
  idempotency validated across all automated tests.
