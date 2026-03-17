# Feature Specification: Hakwa Maps — Crowdsourced Data Collection

**Feature Branch**: `009-hakwa-maps-crowdsourcing`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: OSM does not have sufficient Fiji data. Users of the Hakwa app
participate in providing and verifying the map data needed for Hakwa Maps and
are rewarded through the existing gamification system.

## Background & Problem Statement

OpenStreetMap coverage of Fiji is sparse. Major towns (Suva, Nadi, Lautoka) have
reasonable road coverage, but informal settlements, rural roads, market stalls,
minibus stops, ferry terminals, and local landmarks are largely absent. Because
Hakwa Maps is the sole map layer for the entire platform (Principle XVII), the
quality of the product is directly limited by the quality of OSM's Fiji data.

The solution is a **crowdsourced map contribution loop** native to the Hakwa
apps: passengers and drivers who know their local area identify and submit
missing or incorrect map features. Other users verify those submissions. Once a
submission crosses a verification threshold it becomes **active** in Hakwa Maps.
All accepted contributions are published under the **ODbL licence**
(OpenStreetMap's open-data licence) so they can eventually be upstreamed to OSM,
improving data quality for everyone.

Contributions are rewarded through the **existing gamification system**
(Principle VII) — new `PointsSourceAction` types and new badges, with no changes
to the wallet, points-account architecture, or concurrency rules already in the
constitution.

### Engagement Design Philosophy

The primary risk with crowdsourced mapping is that it _feels like unpaid work_.
Four design principles prevent that:

1. **Discovery framing, not data-entry framing.** The feature is called
   _"Explore & Map Fiji"_, not _"Contribute to Hakwa Maps."_ Language matters —
   users are explorers uncovering their island, not filling in a database.

2. **Zero-effort paths alongside intentional ones.** Drivers who opt in to
   passive road tracing earn points automatically during trips they are already
   taking. Verifying a nearby pin while waiting for a booking takes 5 seconds.
   The system meets users where they already are.

3. **Visible real-world impact.** An abstract point total does not motivate as
   strongly as _"your taxi stand pin has helped 47 rides."_ The impact counter
   and neighbourhood progress bar turn individual actions into tangible
   community outcomes.

4. **Variable and social rewards.** Flat-rate points are table stakes. Weekly
   missions with bonus multipliers, surprise pioneer bonuses for unmapped zones,
   and photo bonuses create unpredictable reward moments — the most powerful
   engagement pattern in behavioural design. The neighbourhood completion bar is
   a communal goal shared with everyone in the area, transforming solo
   contributions into collective pride.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Submit a Map Contribution (Priority: P1)

A Rider or Driver notices that a well-known market or taxi stand is missing from
the map. They long-press the map at the correct location, fill in the feature
details (name, type, optional note, optional photo), and submit. Their
contribution appears on the map as a **pending** feature visible to other nearby
users. They immediately receive points and see an in-app toast: _"You added a
new map feature — 25 pts!"_

**Why this priority**: Without submissions, no data flows into the system. This
is the core action everything else depends on.

**Independent Test**: A logged-in user can submit a map contribution with a
name, type, and coordinates. A `mapFeature` row is created with
`status = "pending"`, a `mapContributionEvent` ledger entry is created, the
user's `pointsAccount` balance increases, and the submission is immediately
visible to the contributor via the pending-features endpoint — independently of
verification, badges, or leaderboard.

**Acceptance Scenarios**:

1. **Given** a logged-in passenger with GPS accuracy ≤ 50 m, **When** they
   long-press the map and submit a new POI with name, category, and coordinates,
   **Then** a `mapFeature` row (`status = "pending"`) is created, a
   `pointsLedger` entry of type `map_contribution` is inserted, the user's
   `pointsAccount.totalPoints` is incremented, and a real-time push notification
   saying _"You earned 25 pts for your map contribution!"_ is delivered to the
   user.
2. **Given** a user submitting a Road Correction, **When** they select the
   affected road segment, provide a corrected name or description, and submit,
   **Then** a `mapFeature` row of type `road_correction` is created in `pending`
   state with the corrected attributes and linked OSM way reference if provided.
3. **Given** a user whose GPS accuracy exceeds 50 m, **When** they attempt to
   submit a contribution, **Then** the submission is blocked with a message
   _"GPS accuracy too low. Move to an open area and try again."_ and no
   `mapFeature` row is created.
4. **Given** a user who has already submitted 20 map features in the current
   calendar day, **When** they try to submit another, **Then** the system
   rejects it with error `MAP_DAILY_LIMIT_REACHED` and no points are awarded
   (rate limit prevents abuse).
5. **Given** a submission with a `photoUrl` attached, **When** the `mapFeature`
   is created, **Then** the `photoUrl` is stored on the record and is included
   in the verification view served to other users.

---

### User Story 2 — Verify a Pending Contribution (Priority: P1)

A Driver sees a cluster of pending (orange) pins on the map while waiting for a
booking. They tap one and the verification card slides up showing: the submitted
feature name, type, photo, and submitter (first name only). The driver taps
**Confirm** or **Dispute**, optionally adds a note, and submits. They earn
points for each verification action and progress toward the _"Community
Guardian"_ badge.

**Why this priority**: Verifications are the quality gate. Without them,
contributions never become active and the data pipeline stalls.

**Independent Test**: A user who did not submit a feature can open its
verification card, cast a confirm or dispute vote, and receive points — without
requiring the feature to reach its activation threshold or triggering any badge.

**Acceptance Scenarios**:

1. **Given** a `mapFeature` in `pending` state that the viewing user did not
   submit, **When** the user submits a `confirm` vote, **Then** a
   `mapVerification` row is created, the feature's `confirmCount` is
   incremented, a `pointsLedger` entry of type `map_verification` is inserted
   for the verifier, and their `totalPoints` is updated.
2. **Given** the same conditions, **When** the user submits a `dispute` vote
   with an optional note, **Then** a `mapVerification` row is created with
   `vote = "dispute"`, the feature's `disputeCount` is incremented, and the same
   points reward is applied.
3. **Given** a user who has already cast a vote on a specific `mapFeature`,
   **When** they attempt to vote again on the same feature, **Then** the system
   rejects it with `MAP_ALREADY_VOTED` and no points are awarded.
4. **Given** a user trying to verify their own submission, **When** they open
   the verification card, **Then** the confirm/dispute buttons are hidden and a
   label reads _"Your submission"_.
5. **Given** a feature receiving its 3rd confirmation vote, **When** the
   verification threshold is crossed, **Then** the feature's status transitions
   to `active`, the original contributor receives a `map_contribution_accepted`
   `pointsLedger` bonus entry, and a push notification is sent to the
   contributor: _"Your map feature was verified by the community! +50 pts"_.

---

### User Story 3 — Feature Goes Active / Rejected (Priority: P1)

Once a pending contribution accumulates enough community votes it is either
activated (becomes visible to all users as a permanent map feature) or rejected
(removed from pending view). Both outcomes close the voting window for that
feature.

**Why this priority**: State transitions are the core reliability contract; the
point-of-no-return boundary for data quality.

**Independent Test**: A `mapFeature` row's status can be driven from `pending`
to `active` (or `rejected`) purely by incrementing its vote counters without
touching the gamification, leaderboard, or photo systems.

**Acceptance Scenarios**:

1. **Given** a feature with `confirmCount = 3` and `disputeCount < 2`, **When**
   the `confirmCount` reaches `ACTIVATION_THRESHOLD` (3), **Then** the feature
   `status` transitions to `active`, new votes are no longer accepted, and the
   feature appears on the map's permanent layer.
2. **Given** a feature with `disputeCount = 3` and
   `confirmCount < ACTIVATION_THRESHOLD`, **When** the `disputeCount` reaches
   `REJECTION_THRESHOLD` (3), **Then** the feature `status` transitions to
   `rejected`, it is removed from all map layers, and the feature is no longer
   shown.
3. **Given** a feature that has been active for 30+ days, **When** a user
   reports it as no longer accurate, **Then** the feature transitions back to
   `pending` with a fresh vote slate (`confirmCount = 0`, `disputeCount = 0`)
   and the reporter does not receive contribution points (to prevent gaming).
4. **Given** a feature awaiting verification for more than 60 days with fewer
   than 2 total votes, **When** the nightly cleanup job runs, **Then** the
   feature transitions to `stale` and is removed from the pending layer.

---

### User Story 4 — Map Badges & Milestones (Priority: P2)

Users who contribute and verify map data progress toward dedicated Hakwa Maps
badges that are separate from the transport badges. These milestones reinforce
the mapping behaviour and give users visible social proof of their local
expertise.

**Why this priority**: Badges are the long-term engagement hook. They create
goals beyond a single interaction and are shareable.

**Independent Test**: The badge-check worker can evaluate all map badges from
`pointsLedger` and `mapFeature` counts alone, independently of trip or referral
data.

**Acceptance Scenarios**:

1. **Given** a user who submits their first map feature (any type), **When** the
   `mapFeature` row is committed, **Then** the badge `map_first_contribution` is
   awarded if not already held, and a notification confirms it.
2. **Given** a user whose accepted contribution total reaches 10, **When** the
   badge worker evaluates after the 10th acceptance, **Then** the badge
   `map_10_accepted` is awarded.
3. **Given** a user whose accepted contribution total reaches 50, **When** the
   badge worker runs, **Then** the badge `map_local_expert` is awarded.
4. **Given** a user who casts their 25th verification vote, **When** the count
   threshold is crossed, **Then** the badge `map_25_verifications` is awarded.
5. **Given** a user who casts their 100th verification vote, **When** the count
   threshold is crossed, **Then** the badge `map_community_guardian` is awarded.
6. **Given** a user who has both `map_local_expert` and
   `map_community_guardian`, **When** their combined contribution + verification
   total exceeds 200 actions, **Then** the badge `map_cartographer` is awarded —
   the highest mapping rank.
7. **Given** any badge award, **When** it is granted, **Then** an in-app
   notification and a visual badge animation (confetti) confirm the achievement,
   matching the existing badge-award UX pattern.

---

### User Story 5 — Map Leaderboard (Priority: P2)

A time-windowed leaderboard shows the top 50 map contributors in Fiji (and, in
future, per-island or per-province). Users can see their own rank even if they
are outside the top 50. The leaderboard resets monthly.

**Why this priority**: Public visibility of top contributors creates social
competition and drives sustained engagement.

**Independent Test**: The leaderboard Redis sorted set can be populated and
queried independently of badge evaluation, without needing any contributions to
go active.

**Acceptance Scenarios**:

1. **Given** a `map_contribution` or `map_verification` `pointsLedger` entry is
   written, **When** the post-ledger hook fires, **Then** the user's score in
   the `map:leaderboard:monthly:{YYYY-MM}` Redis sorted set is incremented by
   the awarded map-points value.
2. **Given** a user requesting the leaderboard, **When** the API returns the top
   50, **Then** each entry contains `rank`, `displayName` (first name + last
   initial), `totalMapPoints`, `contributionCount`, and `verificationCount` for
   the current month.
3. **Given** a user ranked outside the top 50, **When** they view the
   leaderboard, **Then** their own rank card is shown below the top-50 list.
4. **Given** the first day of a new calendar month, **When** the scheduler runs,
   **Then** a new sorted set for the new month is initialised and the previous
   month's set is archived (TTL 90 days) but not deleted, so historical rankings
   remain queryable.

---

### User Story 6 — Browse & Filter Pending Contributions (Priority: P3)

A power user wants to help verify as many contributions as possible. They switch
to "Community Map" mode in the app, see all pending features in their area, and
can filter by contribution type (POI / road correction / area) and age. They can
quickly swipe through verification cards.

**Why this priority**: The batch-verification UX unlocks efficient, high-volume
community moderation. Without it, verifications trickle in slowly from
incidental encounters.

**Independent Test**: The pending-contributions list endpoint returns paginated
results filtered by bounding box, type, and age without touching gamification or
Redis.

**Acceptance Scenarios**:

1. **Given** a bounding-box query `?bbox=lat1,lng1,lat2,lng2`, **When** the API
   is called, **Then** only `pending` features whose coordinates lie within the
   box are returned, paginated at 20 per page.
2. **Given** a `?type=road_correction` filter, **When** the API is called,
   **Then** only features of that type are returned.
3. **Given** a `?sort=oldest`, **When** the API is called, **Then** features are
   ordered ascending by `createdAt` so long-waiting contributions get attention
   first.
4. **Given** a user swiping through the verication card stack, **When** they
   cast a vote and swipe to the next card, **Then** the vote is persisted
   without requiring explicit navigation.

---

### User Story 7 — Passive Road Tracing (Priority: P2)

A driver opts into passive road tracing in their app settings. During every trip
they accept, Hakwa silently records their GPS trace in the background. After the
trip completes, a background worker compares the trace against the existing
active map-feature layer. Segments more than 20 m from any known road feature
are flagged as novel and the driver earns **1 point per km of new road traced**,
up to a daily cap. A toast appears after the trip summary: _"Your drive traced
4.2 km of new roads — 4 pts!"_ No action is required during the drive.

**Why this priority**: Passive tracing is the lowest-friction data collection
possible and targets drivers — the users who cover the most road network daily.
Road connectivity is the data gap that hurts routing quality most.

**Independent Test**: A completed driver trip with opt-in tracing enabled
results in a `pointsLedger` entry of type `map_road_trace` and an updated
`mapContributorStats.totalContributions`, without requiring any user interaction
beyond accepting the trip.

**Acceptance Scenarios**:

1. **Given** a driver with passive tracing enabled, **When** a trip transitions
   to `completed`, **Then** the GPS trace is submitted to the road-trace worker
   asynchronously (after the primary trip transaction commits), and the worker
   computes novel km against the active feature layer.
2. **Given** a GPS trace that contains 4.2 km of road not within 20 m of any
   active feature, **When** the worker finishes, **Then** a `pointsLedger` entry
   of type `map_road_trace` for 4 pts is created and the driver receives a
   post-trip toast notification.
3. **Given** a driver who has already earned `MAP_ROAD_TRACE_DAILY_CAP_PTS` (50
   pts) from road tracing today, **When** a new trace is processed, **Then** the
   worker stores the trace in `mapRoadTrace` for data quality purposes but
   awards 0 points and does not send a notification.
4. **Given** a driver with passive tracing disabled, **When** a trip completes,
   **Then** no GPS trace is processed and no road-trace ledger entry is created.
5. **Given** a GPS trace that overlaps an already-active road segment (within 20
   m), **When** the worker evaluates that segment, **Then** 0 pts are awarded
   for it — only genuinely novel road km is rewarded.

---

### User Story 8 — Weekly Map Missions (Priority: P2)

Every Monday a new set of three themed missions appears on the user's map tab
under _"This Week's Missions."_ A mission is a time-bounded challenge — for
example: _"Add 3 bus stops anywhere in Fiji,"_ _"Verify 10 features in Nadi town
this week,"_ _"Submit a photo with your next 2 contributions."_ Each mission has
its own progress bar. Completing all three before Sunday midnight unlocks a
**Mission Complete** bonus of 100 pts. Missing the deadline resets the slate —
old missions cannot be retroactively claimed.

**Why this priority**: Missions create a weekly return cadence. A user who opens
the app for a booking, sees 2/3 missions nearly complete, and decides to quickly
pin a nearby stall has been organically retained. Missions also direct effort to
under-mapped areas or feature types the platform currently needs most.

**Independent Test**: A `mapMission` record and three `mapMissionProgress` rows
can be created for a user and their completion state driven independently of the
leaderboard, zone progress, or passive tracing systems.

**Acceptance Scenarios**:

1. **Given** the scheduler runs on Monday UTC midnight, **When** the week turns
   over, **Then** three `mapMission` rows are created with `weekStart` set to
   that Monday and `deadline` set to Sunday 23:59:59 UTC.
2. **Given** a user with an active mission of type `contribute_poi` with
   `targetCount = 3`, **When** they submit a POI contribution, **Then** their
   `mapMissionProgress.progressCount` is incremented; when it reaches
   `targetCount` the mission row is marked `completed`.
3. **Given** a user who completes all three missions before the deadline,
   **When** the third mission is marked `completed`, **Then** a `pointsLedger`
   entry of type `map_mission_completed` awarding `MAP_POINTS_MISSION_BONUS`
   (100 pts) is created, and a push notification fires: _"Weekly missions
   complete — bonus 100 pts!"_
4. **Given** Sunday midnight UTC arriving with a user having 2/3 missions
   complete, **When** the expiry job runs, **Then** the incomplete missions are
   marked `expired`; no bonus is awarded; the user is notified: _"One more
   mission and you'd have earned the bonus — try again next week!"_
5. **Given** a new mission set active, **When** a user views their map tab,
   **Then** the three missions are displayed with labels, progress bars, target
   counts, and days remaining.

---

### User Story 9 — Neighbourhood Progress Map (Priority: P3)

Fiji is divided into named geographic zones (_Suva CBD_, _Nadi Town_, _Lautoka_,
_Labasa_, _Sigatoka Valley_, etc.). In the _"Explore & Map Fiji"_ view, each
zone is shaded by its community completion percentage — lightly tinted for
sparse zones, fully tinted for well-mapped ones. Tapping a zone shows its name,
current completion %, and the top three contributors. When a zone crosses 50%
completion, every contributor receives a push notification: _"Suva CBD is
halfway mapped — and you helped!"_ At 100%, every contributor earns the
`map_zone_complete` badge. The progress bar resets if a significant number of
features are disputed back to pending.

**Why this priority**: The progress bar is a communal goal visible to everyone
in the area. It transforms solo contributions into collective pride and gives a
concrete answer to _"why should I do this?"_ — users can see exactly how much of
their neighbourhood is still dark on the map.

**Independent Test**: A `mapZone` record's `currentFeatureCount` can be
incremented and its completion percentage derived and cached in Redis without
touching the mission, passive-trace, or leaderboard systems.

**Acceptance Scenarios**:

1. **Given** a `mapFeature` transitions to `active` and its coordinates lie
   within a `mapZone` polygon, **When** the post-activation hook fires, **Then**
   the zone's `currentFeatureCount` is incremented atomically and the Redis key
   `map:zone:{id}:pct` is updated.
2. **Given** a zone whose completion percentage crosses 50% after an activation,
   **When** the zone-progress worker evaluates the threshold, **Then** a
   broadcast notification is sent to all contributors of that zone.
3. **Given** a zone hitting 100% completion, **When** the threshold is crossed,
   **Then** every contributor receives the `map_zone_complete` badge
   (idempotent; unique on `userId + badgeKey`) and a celebration notification.
4. **Given** a user viewing the Explore map and tapping a zone, **When** the
   zone card opens, **Then** they see: zone name, completion %, active feature
   count, target feature count, and the top 3 contributors by
   `acceptedContributions` in that zone.

---

### User Story 10 — First Discoverer Bonus (Priority: P3)

When a user submits the very first `mapFeature` in a `mapZone` that previously
had zero active features, they are a _Pioneer_ of that zone. They immediately
receive a **Pioneer bonus** of 75 pts and the `map_pioneer` badge. Their profile
permanently lists the zones they pioneered. A user who pioneers 3 or more zones
earns the `map_explorer` badge. The Pioneer label appears on the zone detail
card alongside the contributor's name as long as the zone has fewer than 10
active features — after that, the zone is no longer _"unexplored,"_ and the
label fades.

**Why this priority**: The pioneer mechanic creates a land-grab dynamic in
unmapped areas. It rewards early movers disproportionately, exactly when the
platform most needs someone to go first.

**Independent Test**: The pioneer bonus can be triggered by a zone's
`currentFeatureCount` transitioning from 0 to 1, independently of missions,
passive tracing, and leaderboard systems.

**Acceptance Scenarios**:

1. **Given** a `mapFeature` becomes `active` in a zone whose
   `currentFeatureCount` was 0 before that activation, **When** the zone counter
   increments to 1, **Then** a `pointsLedger` entry of type `map_pioneer_bonus`
   awarding `MAP_POINTS_PIONEER_BONUS` (75 pts) is created for the contributor,
   and the `map_pioneer` badge is awarded if not already held.
2. **Given** a user who has just pioneered their 3rd distinct zone, **When** the
   badge worker evaluates their stats, **Then** the `map_explorer` badge is
   awarded.
3. **Given** a zone with `currentFeatureCount = 1`, **When** a user views the
   zone detail card, **Then** the pioneer's display name is shown with the label
   _"First Explorer."_
4. **Given** a zone that already has ≥ 1 active feature when a new feature is
   submitted, **When** that new feature becomes active, **Then** no pioneer
   bonus is awarded.

---

### User Story 11 — Safety, Moderation & Trust (Priority: P1)

The platform operates a three-layer safety architecture that is invisible to
honest users but catches harmful content automatically, empowers the community
to flag live problems, and gives administrators the tools to act quickly. The
single guiding principle is **zero friction for legitimate users, zero tolerance
for harmful content**.

**Why this priority**: A single harmful pin — an offensive name, a deliberately
wrong road in a remote area, or a fake "safe shortcut" through private property
— could cause real-world harm or erode trust in the entire product. Safety is a
prerequisite for shipping a live map product, not an afterthought.

**Independent Test**: A feature submission whose `name` matches a blocked
keyword pattern is created with `status = "pending_review"` and no
`pointsLedger` entry is written — independently of the verification, badge, and
leaderboard systems.

**Acceptance Scenarios**:

1. **Given** a user submits a feature whose `name` matches a blocked keyword,
   **When** the content screener evaluates the text synchronously, **Then** the
   `mapFeature` is created with `status = "pending_review"`, a moderator alert
   is enqueued, and no `pointsLedger` entry is created. The user sees no error —
   their app shows a reassuring _"Feature submitted — we'll review it shortly
   (usually within 24 hours)."_ confirmation.

2. **Given** a `mapFeature` in `pending` state that 3 distinct users have
   reported via `POST /map/features/:id/report`, **When** the third report is
   submitted, **Then** the feature atomically transitions to `under_review`,
   disappears from the pending layer for all users, and the original contributor
   receives a push notification: _"A feature you submitted is currently under
   community review."_

3. **Given** a moderator opens `GET /admin/map/moderation/queue`, **When** they
   approve a `pending_review` feature, **Then** in a single atomic transaction
   the feature transitions to `pending`, the withheld contribution points are
   awarded via a `pointsLedger` entry, and the action is logged to
   `mapModerationLog`. The feature is now visible in the community verification
   queue.

4. **Given** a moderator approves an `under_review` feature, **When** the action
   is applied, **Then** the feature transitions back to `active`, all map layers
   are refreshed (Redis invalidation), the contributor receives _"Your map
   feature has been reviewed and restored — thanks for contributing!"_, and the
   action is logged.

5. **Given** a moderator rejects any feature under review, **When** the action
   is applied, **Then** the feature transitions to `rejected`, the contributor
   receives _"A map feature you submitted was removed after review. Please see
   our Community Guidelines."_, no `pointsLedger` reversal is performed, and the
   action is logged.

6. **Given** a moderator applies `ban_contributor` to a feature's original
   contributor, **When** the ban is active, **Then** that user's subsequent map
   contribution and verification requests return `403 MAP_USER_MAP_BANNED` and
   no rows are created.

7. **Given** a Trusted Contributor (≥ 5 accepted contributions, no active ban)
   who casts a dispute with `disputeCategory = "harmful_content"`, **When** the
   vote is submitted, **Then** the feature immediately transitions to
   `under_review` regardless of its current `disputeCount`, a moderator alert is
   enqueued, and the trusted contributor earns standard verification points.

8. **Given** a submission whose coordinates are more than 250 km/h away from the
   same user's previous submission within the past 60 minutes, **When** the
   submission is received, **Then** the feature is created with
   `status = "pending_review"` and `gpsVelocityFlag = true`, a moderator alert
   is enqueued, and no points are awarded until an admin clears it.

---

### Edge Cases

- A user submitting duplicate coordinates (within 10 m) for a feature of the
  same type: system MUST prompt _"A similar feature exists nearby — verify the
  existing one instead?"_ and link to it, but MUST NOT auto-block the
  submission.
- A user submitting coordinates outside Fiji's bounding box
  `(-21.5, 176.5) to (-15.0, -179.5)`: submission MUST be rejected with
  `MAP_OUT_OF_BOUNDS`.
- GPS temporarily returns (0, 0) or NaN: submission MUST be blocked with a
  sanitisation error; these coordinates MUST never be persisted.
- A user who is banned or whose account is suspended: the contribution and
  verification endpoints MUST return `403 Forbidden`; no `mapFeature` or
  `mapVerification` rows are created.
- A `mapVerification` inserted concurrently with another vote that tips the
  feature over the threshold: the activation check MUST be atomic (row-level
  lock on `mapFeature` during vote insert) to prevent double-activation.
- A contribution with a photo that exceeds 5 MB: rejected at upload stage with
  `MAP_PHOTO_TOO_LARGE`; contribution form state is preserved so the user is not
  forced to re-enter text fields.
- An already-closed (active/rejected/stale) feature receiving a vote attempt:
  `MAP_VOTING_CLOSED` error; no points awarded.
- A road trace from a driver who has not opted in: GPS coordinates MUST NOT be
  stored or processed for map-tracing purposes.
- A mission whose action type does not apply to the actor's role (e.g., a
  `contribute_road_trace` mission served to a passenger): progress is simply
  never incremented — no error, no notification.
- Simultaneous zone-threshold events (multiple features activating in the same
  zone at the same time): zone counter updates MUST be atomic
  (`UPDATE map_zone SET current_feature_count = current_feature_count + 1`) to
  prevent double-notification of the 50%/100% milestone.
- Pioneer bonus race condition (two features go active in the same empty zone
  near-simultaneously): the first `UPDATE` to increment `currentFeatureCount`
  from 0 receives the pioneer bonus; the second sees `currentFeatureCount = 1`
  and receives no bonus.
- A report against a `pending_review`, `under_review`, `rejected`, or `stale`
  feature: `POST /map/features/:id/report` MUST return `409 MAP_VOTING_CLOSED` —
  reporting is only open while a feature is `pending` or `active`.
- A user attempting to report their own submission: the endpoint MUST return
  `403 MAP_CANNOT_REPORT_OWN`; no `mapFeatureReport` row is created.
- A moderator approving a `pending_review` feature: the withheld contribution
  points MUST be awarded atomically in the same transaction as the status
  transition. A crash between the two steps MUST NOT leave the feature approved
  but the user unpaid.
- A user whose `banExpiresAt` is in the past: the ban MUST be lifted
  automatically (`isMapBanned = false`, `banExpiresAt = null`) inline during the
  request — not on a nightly job — so an expired ban never silently blocks a
  legitimate user.
- A Trusted Contributor who subsequently falls below the
  `MAP_TRUST_MIN_ACCEPTED_TRUSTED` threshold: trust tier is recomputed
  dynamically on each request; prior trusted-dispute escalations are not
  retroactively reversed.
- A `pending_review` feature receiving a vote attempt from another user: the
  verify endpoint MUST return `409 MAP_VOTING_CLOSED` because `pending_review`
  features are not visible in the community verification queue.
- The nightly abuse-detection job flagging the same user pair on consecutive
  nights: `mapAbuseFlag.occurrenceCount` MUST be incremented via an upsert
  (`ON CONFLICT (userId, flagType) DO UPDATE SET occurrenceCount = ...`) — not a
  new row inserted — to prevent unbounded table growth.

---

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST allow any authenticated user (passenger or driver)
  to submit a map feature of one of the allowed types (see entity list below).
- **FR-002**: The system MUST reject submissions whose GPS coordinates fall
  outside the Fiji bounding box or whose accuracy exceeds 50 m.
- **FR-003**: The system MUST enforce a maximum of
  `MAP_DAILY_CONTRIBUTION_LIMIT` (20) feature submissions per user per calendar
  day (UTC).
- **FR-004**: The system MUST allow any authenticated user to cast exactly one
  `confirm` or `dispute` vote per `mapFeature`, except the original contributor.
- **FR-005**: When a feature's `confirmCount` reaches `MAP_ACTIVATION_THRESHOLD`
  (3) and `disputeCount` is below `MAP_REJECTION_THRESHOLD` (3), the system MUST
  transition the feature to `active` status atomically.
- **FR-006**: When a feature's `disputeCount` reaches `MAP_REJECTION_THRESHOLD`
  (3) and `confirmCount` has not yet reached the activation threshold, the
  system MUST transition the feature to `rejected` status.
- **FR-007**: On `map_contribution` action, the system MUST award
  `MAP_POINTS_CONTRIBUTION` (25) points via a `pointsLedger` entry.
- **FR-008**: On `map_verification` action (confirm or dispute), the system MUST
  award `MAP_POINTS_VERIFICATION` (5) points via a `pointsLedger` entry.
- **FR-009**: On feature activation, the system MUST award the original
  contributor an additional `MAP_POINTS_ACCEPTED` (50) points via a
  `pointsLedger` entry of type `map_contribution_accepted`.
- **FR-010**: All map-related `pointsLedger` entries MUST trigger the existing
  badge-evaluation worker with `sourceAction` scoped to map action types.
- **FR-011**: Pending features MUST be queryable by bounding box, feature type,
  and age, paginated at 20 results per page.
- **FR-012**: Active features MUST be returned as a GeoJSON `FeatureCollection`
  via a dedicated tile/layer endpoint for rendering in `@hakwa/map`.
- **FR-013**: The system MUST maintain a Redis sorted set
  `map:leaderboard:monthly:{YYYY-MM}` that is incremented atomically on every
  map-related `pointsLedger` write.
- **FR-014**: A nightly job MUST transition `pending` features that are older
  than 60 days with fewer than 2 total votes to `stale`.
- **FR-015**: All `mapFeature` geometry MUST be stored as a PostGIS `geometry`
  column (or, if PostGIS is unavailable, as a GeoJSON TEXT column) with
  coordinate precision limited to 6 decimal places.
- **FR-016**: The system MUST prevent submission of coordinates (0, 0) or any
  NaN coordinate value at the API boundary with a validation error.
- **FR-017**: Proposed contributions MUST display a proximity warning to the
  submitter if a feature of the same type exists within 10 m.
- **FR-018**: All accepted `mapFeature` records MUST carry an `osmLicence` field
  set to `"ODbL"` to track data licensing for future OSM upstream contribution.
- **FR-019**: The Rider App, Driver App, and Rider Web Portal MUST expose an
  _"Explore & Map Fiji"_ entry point (not _"Contribute to Hakwa Maps"_) that
  opens the contribution/explore flow in `@hakwa/map`.
- **FR-020**: The Rider App and Driver App MUST support offline _queuing_ of map
  contributions when the device has no connectivity; the queued submission is
  sent when the connection is restored (no points are awarded until server-side
  validation succeeds).
- **FR-021**: Contributions submitted with a `photoUrl` MUST award an additional
  `MAP_POINTS_PHOTO_BONUS` (10 pts) via a separate `pointsLedger` entry of type
  `map_photo_bonus` at the time the `mapFeature` row is created. The total for a
  photo-backed submission is therefore 35 pts.
- **FR-022**: Drivers who have opted into passive road tracing MUST have their
  GPS trace submitted to a `@hakwa/workers` road-trace task after each trip
  transitions to `completed`. The worker MUST identify novel road km (segments
  > 20 m from any active feature), persist the trace in `mapRoadTrace`, and
  > award `MAP_POINTS_ROAD_TRACE_PER_KM` (1 pt per km, floored) via a
  > `pointsLedger` entry of type `map_road_trace`, capped at
  > `MAP_ROAD_TRACE_DAILY_CAP_PTS` (50 pts) per driver per UTC day. GPS data
  > MUST NOT be processed for tracing if the driver has not opted in.
- **FR-023**: A scheduled job MUST create `MAP_MISSIONS_PER_WEEK` (3)
  `mapMission` rows every Monday UTC midnight. Each mission specifies an
  `actionType`, `targetCount`, optional `zoneId` scope, and a `deadline` of
  Sunday 23:59:59 UTC. When all three missions for a week are completed before
  their deadline, the system MUST award `MAP_POINTS_MISSION_BONUS` (100 pts) via
  a `pointsLedger` entry of type `map_mission_completed`. Incomplete missions
  expire and are not retroactively completable.
- **FR-024**: The system MUST maintain a `mapZone` table of named geographic
  zones (GeoJSON polygon, `slug`, `targetFeatureCount`). On every `mapFeature`
  activation, the containing zone's `currentFeatureCount` MUST be incremented
  atomically. Zone completion percentage MUST be cached in Redis
  (`map:zone:{id}:pct`). When a zone crosses 50% or 100%, a broadcast push
  notification MUST be sent to all contributors of that zone. At 100%, every
  contributor receives the `map_zone_complete` badge (idempotent).
- **FR-025**: When a `mapFeature` becomes `active` in a `mapZone` whose
  `currentFeatureCount` was 0 before that activation, the system MUST award
  `MAP_POINTS_PIONEER_BONUS` (75 pts) to the contributor via a `pointsLedger`
  entry of type `map_pioneer_bonus` and trigger a `map_pioneer` badge check.
  This MUST be race-condition safe — only the first activation per zone receives
  the bonus (see edge cases).
- **FR-026**: The `GET /map/stats/me` response MUST include a `rideImpactCount`
  field: the number of completed trips whose route, pickup, or dropoff passed
  within 100 m of any active `mapFeature` this user contributed.
- **FR-027**: A `mapStreak` (consecutive UTC days with at least one map action)
  MUST be tracked in `mapContributorStats` separately from the transport streak.
  A 7-day map streak MUST award `MAP_POINTS_MAP_STREAK_7` (35 pts) via a
  `pointsLedger` entry of type `streak_bonus`.

### Safety, Moderation & Trust

- **FR-028**: Every map feature submission MUST pass synchronously through a
  keyword-and-pattern content screener before any database rows are written. The
  screener checks `name` and `description` against a blocklist compiled from
  `@hakwa/core/map-blocklist.json` at server startup (no per-request DB reads).
  Outcomes: (a) `pass` — feature created with `status = "pending"` and points
  awarded normally; (b) `flag` — feature created with
  `status = "pending_review"`, a moderator alert enqueued, and **no**
  `pointsLedger` entry created until admin clears it; (c) `auto_reject` —
  submission refused with `422 MAP_CONTENT_VIOLATION` and no rows created.

- **FR-029**: Contribution points for a `pending_review` feature are withheld
  until an admin clears the feature. When an admin issues the `approve` action
  on a `pending_review` feature, the system MUST atomically create the
  `pointsLedger` entry (type `map_contribution`, and `map_photo_bonus` if
  applicable) and update `mapContributorStats` in the **same transaction** as
  the `status` transition to `"pending"`.

- **FR-030**: Any authenticated user who is not the original contributor MAY
  report a `mapFeature` in `pending` or `active` state exactly once via
  `POST /map/features/:id/report`, supplying a `reason` and optional `note`. The
  `(featureId, reporterId)` pair must be unique. Reporting a feature in any
  other status MUST return `409 MAP_VOTING_CLOSED`. Reporting one's own
  contribution MUST return `403 MAP_CANNOT_REPORT_OWN`.

- **FR-031**: When the distinct reporter count on a `mapFeature` reaches
  `MAP_REPORT_AUTO_REVIEW_THRESHOLD` (3), the system MUST hold a row-level lock
  on `mapFeature` during the threshold check to prevent race-condition
  double-transitions. On threshold, the feature MUST atomically transition to
  `under_review`, be removed from all public map layers (pending and active),
  and push a notification to the original contributor: _"A feature you submitted
  is currently under community review."_

- **FR-032**: Admin-facing moderation endpoints MUST be protected by middleware
  that confirms `admin` or `map_moderator` role before any business logic
  executes; any other caller receives `403 Forbidden`.
  `GET /admin/map/moderation/queue` returns features in `pending_review` and
  `under_review` state, paginated 20 per page, sorted oldest-first.
  `POST /admin/map/features/:id/moderate` accepts actions: `approve`, `reject`,
  `warn_contributor`, `ban_contributor`.

- **FR-033**: Every successful call to `POST /admin/map/features/:id/moderate`
  MUST produce an append-only `mapModerationLog` row containing `featureId`,
  `actorId` (admin's user ID), `action`, optional `reason`, and `createdAt`.
  Rows MUST never be updated or deleted — the log is an immutable audit trail.

- **FR-034**: When an admin approves an `under_review` feature (restoring it to
  `active`), the contributor MUST receive a push notification: _"Your map
  feature has been reviewed and restored — thanks for contributing!"_ When an
  admin rejects any feature under review, the contributor MUST receive: _"A map
  feature you submitted was removed after review. Please see our Community
  Guidelines."_ No `pointsLedger` reversal is performed on rejection of a
  previously-awarded contribution.

- **FR-035**: A contributor's trust tier MUST be computed dynamically at request
  time from `mapContributorStats.acceptedContributions` and
  `mapContributorTrust.isMapBanned`. Tiers (from weakest to strongest): (a)
  `standard` — default for all users, or any user with `isMapBanned = true`; (b)
  `trusted` — `acceptedContributions >= MAP_TRUST_MIN_ACCEPTED_TRUSTED` (5) with
  no active ban; (c) `senior` —
  `acceptedContributions >= MAP_TRUST_MIN_ACCEPTED_SENIOR` (20) with no active
  ban. Trust tier MUST appear in `GET /map/stats/me` under the `trustTier`
  field. The tier is never stored in the database — it is always derived.

- **FR-036**: Trusted and Senior contributors MAY include a `disputeCategory`
  field (`"harmful_content" | "dangerous_info" | "spam" | "duplicate"`) in their
  `POST /map/features/:id/verify` body. When a Trusted or Senior contributor
  casts a dispute with `disputeCategory = "harmful_content"` or
  `"dangerous_info"`, the feature MUST immediately transition to `under_review`
  regardless of `disputeCount`, and a moderator alert MUST be enqueued. Standard
  contributors may include `disputeCategory` but the instant-escalation rule
  does not apply to them. Verification points are awarded to the voter
  regardless of tier.

- **FR-037**: Every `POST /map/features` request MUST apply a GPS velocity
  heuristic. Before inserting, the API looks up the submitter's most recent
  `mapFeature.createdAt` and `geometryJson` centroid from the past 60 minutes.
  If found and the haversine distance implies a velocity exceeding
  `MAP_GPS_MAX_VELOCITY_KM_H` (250 km/h), the feature MUST be created with
  `status = "pending_review"` and `gpsVelocityFlag = true`, and a moderator
  alert enqueued. This lookup is folded into the same pre-insert SELECT that
  checks the daily rate limit — no extra database round-trip is required.

- **FR-038**: Every `POST /map/features` and `POST /map/features/:id/verify`
  request MUST check `mapContributorTrust.isMapBanned` for the requesting user
  before any business logic executes. If `isMapBanned = true`, the API MUST
  return `403 MAP_USER_MAP_BANNED` immediately. Before the ban check, if
  `banExpiresAt` is non-null and in the past, the ban MUST be atomically lifted
  (`isMapBanned = false`, `banExpiresAt = null`) so the user proceeds normally
  on this request.

- **FR-039**: A nightly `map-abuse-check` job MUST scan mutual verification
  patterns over the past 30 days. For any pair of users where each has confirmed
  at least one feature submitted by the other, and the mutual confirmation count
  exceeds `MAP_VOTING_RING_MUTUAL_THRESHOLD` (80%) of **both** users' total
  confirmations in that window, both users MUST be upserted into `mapAbuseFlag`
  with `flagType = "voting_ring"` (incrementing `occurrenceCount` on conflict).
  The job MUST NOT automatically nullify votes or apply bans — only an explicit
  admin action triggers those consequences.

### Key Entities

- **`mapFeature`**: A single geographic feature submitted by a user. Contains
  the feature `type`, GeoJSON `geometry` (point, linestring, or polygon),
  `name`, `category`, optional `description`, optional `photoUrl`, submission
  `status`, vote counters (`confirmCount`, `disputeCount`), `contributorId`,
  `osmLicence`, and lifecycle timestamps.

- **`mapVerification`**: A single vote cast by a user on a `mapFeature`.
  Contains `featureId`, `userId`, `vote` (`confirm` | `dispute`), optional
  `note`, and `createdAt`. Unique constraint on `(featureId, userId)`.

- **`mapContributorStats`**: A materialised per-user counter table (updated on
  every relevant `pointsLedger` write) storing `acceptedContributions`,
  `totalContributions`, `totalVerifications`, `mapStreak`,
  `mapStreakCheckpoint`, and `rideImpactCount` — used for badge checks and
  leaderboard display without full ledger scans.

- **`mapZone`**: A named geographic zone defined by a GeoJSON polygon. Carries
  `slug`, `displayName`, `targetFeatureCount`, and `currentFeatureCount`. Used
  for neighbourhood progress display and pioneer bonus evaluation.

- **`mapMission`**: A weekly challenge definition. Carries `weekStart`,
  `deadline`, `actionType`, `targetCount`, optional `zoneId`, and `pointsBonus`.
  Three missions are created per week by the scheduler.

- **`mapMissionProgress`**: Per-user progress on an active mission. Carries
  `missionId`, `userId`, `progressCount`, and `status` (`in_progress` |
  `completed` | `expired`). Unique on `(missionId, userId)`.

- **`mapRoadTrace`**: A raw GPS trace from an opted-in driver trip. Carries
  `tripId`, `driverId`, `traceGeoJson` (LineString), `novelKm`, `pointsAwarded`,
  and `processedAt`. Retained for data-quality auditing and potential future OSM
  road upstreaming.

- **`mapFeatureReport`**: A single user report on a `mapFeature`. Carries
  `featureId`, `reporterId`, `reason` (`harmful_content` | `incorrect_info` |
  `no_longer_exists` | `duplicate`), optional `note`, `status` (`open` |
  `reviewed_actioned` | `reviewed_dismissed`), and `createdAt`. Unique on
  `(featureId, reporterId)`.

- **`mapContributorTrust`**: One safety-state row per user who has ever been
  banned or flagged. Carries `userId`, `isMapBanned` (boolean), `banReason`
  (nullable), `banExpiresAt` (nullable — null means permanent), and
  `contentFlagCount` (incremented on each admin content-violation rejection).
  Absence of a row implies `isMapBanned = false` and zero flags; row is created
  lazily on first ban or flag event.

- **`mapModerationLog`**: An append-only audit trail of every admin action via
  the moderation endpoint. Carries `featureId` (nullable FK — set to null if the
  feature is later hard-deleted), `actorId` (the admin's user ID), `action`,
  optional `reason`, and `createdAt`. Rows are insert-only; never updated or
  deleted.

- **`mapAbuseFlag`**: Flags raised by the nightly abuse-detection job. Carries
  `userId`, `flagType` (`voting_ring` | `gps_velocity_cluster`),
  `occurrenceCount` (incremented via upsert on repeat detection),
  `lastDetectedAt`, and `reviewedAt` (nullable — set by an admin on review).
  Unique on `(userId, flagType)`.

### Non-Functional Requirements

- **NFR-001**: The pending features bounding-box query MUST respond in under 500
  ms for a 10 km × 10 km box containing up to 1 000 pending features (a spatial
  index on `mapFeature.geometry` is mandatory).
- **NFR-002**: The active features GeoJSON endpoint MUST be served from a
  Redis-cached response (TTL 60 s) to avoid repeated full-table scans.
- **NFR-003**: All vote operations that check and update `mapFeature` counters
  MUST hold a row-level lock on the `mapFeature` row for the duration of the
  transaction (consistent with Principle VIII).
- **NFR-004**: Map contribution and verification endpoints MUST be rate-limited
  at the application layer: 20 contributions/day/user (FR-003) and 200
  verifications/day/user.
- **NFR-005**: Photo uploads MUST be handled as a separate pre-upload step
  (presigned URL or background upload) — the contribution submission endpoint
  MUST only receive a `photoUrl` string, not binary data.
- **NFR-006**: Badge evaluation and leaderboard updates triggered by map actions
  MUST execute asynchronously after the primary transaction (consistent with
  Principle IX / Principle X) and MUST NOT block the HTTP response.
- **NFR-007**: The content-screening step in `POST /map/features` MUST run
  synchronously and add no more than 50 ms to P99 latency. The blocklist MUST be
  compiled into an in-memory `Set<string>` and `RegExp[]` at server startup from
  `@hakwa/core/map-blocklist.json` — zero per-request database reads.
- **NFR-008**: All admin moderation endpoints (`/api/v1/admin/map/...`) MUST be
  served from a separate router protected by a role-validation middleware layer
  that checks `admin` or `map_moderator` role before any database access occurs,
  independently of the standard session-auth middleware. A caller without the
  required role receives `403 Forbidden` with no further processing.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A map feature submission endpoint responds within 200 ms at P99
  under normal load — verified by integration benchmark tests.
- **SC-002**: The pending-features bounding-box query responds in under 500 ms
  for a 10 km × 10 km box containing up to 1,000 pending features — enforced by
  a spatial index on `mapFeature.geometry` and validated in the db-layer test
  suite.
- **SC-003**: The active-features GeoJSON endpoint is served from a Redis-cached
  response (TTL 60 s) — verified by asserting zero database calls on the second
  request within the TTL window.
- **SC-004**: Content screening adds no more than 50 ms to P99 request latency —
  verified by a dedicated unit benchmark test with a worst-case blocklist size.
- **SC-005**: A feature reaches `active` status after exactly 3 independent
  confirmation votes, with zero races producing premature activation — verified
  by concurrent-request integration tests.
- **SC-006**: The 20-contributions-per-day-per-user rate limit is enforced with
  zero bypass in automated tests; the 201st request receives
  `MAP_DAILY_LIMIT_REACHED` (HTTP 429).
- **SC-007**: Badge evaluation and leaderboard updates complete asynchronously
  with zero blocking of the HTTP response — verified by asserting response
  return before background job completion in unit tests.

### Design Artifacts

- Data model: [data-model.md](data-model.md)
- Architecture notes and open questions: [plan.md](plan.md)
