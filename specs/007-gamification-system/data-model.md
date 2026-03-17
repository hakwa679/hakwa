# Data Model: Gamification System

## Existing Schema (from `pkg/db/schema/gamification.ts`)

All tables are already defined. This spec documents canonical usage, index
requirements, and Redis structures.

---

### `pointsAccount` table

| Column         | Type                         | Description                    |
| -------------- | ---------------------------- | ------------------------------ |
| `id`           | `uuid` PK                    | Account identity               |
| `userId`       | `uuid` UNIQUE FK → `user.id` | One account per user           |
| `totalPoints`  | `integer` default 0          | Cached running total           |
| `referralCode` | `varchar(12)` UNIQUE         | User's shareable referral code |
| `createdAt`    | `timestamp`                  |                                |

---

### `pointsLedger` table

| Column         | Type                        | Description                      |
| -------------- | --------------------------- | -------------------------------- |
| `id`           | `uuid` PK                   | Entry identity                   |
| `userId`       | `uuid` FK → `user.id`       | Earning user                     |
| `sourceAction` | `points_source_action` enum | See below                        |
| `points`       | `integer`                   | Points awarded (always positive) |
| `description`  | `text`                      | Human-readable label             |
| `referenceId`  | `uuid` nullable             | tripId, badgeId, etc.            |
| `createdAt`    | `timestamp`                 |                                  |

**`points_source_action` enum values** (confirm in schema):

| Value                 | Points | Description                                       |
| --------------------- | ------ | ------------------------------------------------- |
| `trip_completed`      | 10     | Passenger or driver completes a trip              |
| `referral_signup`     | 50     | Referee completes registration with referral code |
| `referral_trip`       | 100    | Referee completes their first trip                |
| `badge_earned`        | Varies | Awarded with badge (badge.bonusPoints)            |
| `streak_milestone_7`  | 25     | 7-day streak bonus                                |
| `streak_milestone_30` | 100    | 30-day streak bonus                               |
| `map_contribution`    | 5      | Verified map contribution (spec 009)              |
| `review_submitted`    | 5      | Trip review submitted (spec 011)                  |

---

### `level` table

| Column      | Type             | Description                                  |
| ----------- | ---------------- | -------------------------------------------- |
| `id`        | `uuid` PK        |                                              |
| `number`    | `integer` UNIQUE | Level number (1, 2, 3, …)                    |
| `name`      | `varchar(50)`    | Display name ("Explorer", "Navigator", etc.) |
| `minPoints` | `integer` UNIQUE | Minimum total points to reach this level     |
| `iconUrl`   | `text` nullable  | Badge icon asset URL                         |

**Current level computation**:

```sql
SELECT * FROM level WHERE min_points <= $totalPoints ORDER BY min_points DESC LIMIT 1;
```

---

### `badge` table

| Column        | Type                 | Description                               |
| ------------- | -------------------- | ----------------------------------------- |
| `id`          | `uuid` PK            |                                           |
| `slug`        | `varchar(50)` UNIQUE | Machine identifier (e.g., `first_trip`)   |
| `name`        | `varchar(100)`       | Display name                              |
| `description` | `text`               |                                           |
| `iconUrl`     | `text`               | Asset URL                                 |
| `bonusPoints` | `integer` default 0  | Points awarded with badge                 |
| `criteria`    | `jsonb`              | Structured criteria for worker evaluation |

**Example `criteria` JSONB**:

```json
{ "type": "trip_count", "threshold": 1 }
{ "type": "trip_count", "threshold": 10 }
{ "type": "referral_count", "threshold": 5 }
```

---

### `userBadge` table

| Column      | Type                   | Description |
| ----------- | ---------------------- | ----------- |
| `id`        | `uuid` PK              |             |
| `userId`    | `uuid` FK → `user.id`  |             |
| `badgeId`   | `uuid` FK → `badge.id` |             |
| `awardedAt` | `timestamp`            |             |

**Unique constraint**: `UNIQUE (userId, badgeId)` — idempotent award.

---

### `referral` table

| Column           | Type                         | Description                        |
| ---------------- | ---------------------------- | ---------------------------------- |
| `id`             | `uuid` PK                    |                                    |
| `referrerId`     | `uuid` FK → `user.id`        | Referring user                     |
| `refereeId`      | `uuid` FK → `user.id` UNIQUE | New user (one referral per user)   |
| `signupRewardAt` | `timestamp` nullable         | When signup reward was granted     |
| `tripRewardAt`   | `timestamp` nullable         | When first-trip reward was granted |
| `createdAt`      | `timestamp`                  |                                    |

---

### `streakCheckpoint` table

| Column             | Type                         | Description                        |
| ------------------ | ---------------------------- | ---------------------------------- |
| `id`               | `uuid` PK                    |                                    |
| `userId`           | `uuid` UNIQUE FK → `user.id` | One row per user                   |
| `currentStreak`    | `integer` default 0          | Current consecutive days           |
| `longestStreak`    | `integer` default 0          | All-time best                      |
| `lastActivityDate` | `date`                       | Last Fiji local date with activity |
| `updatedAt`        | `timestamp`                  | Last update                        |

---

## Redis Structures

### Weekly Leaderboard

Key: `leaderboard:weekly:{YYYY-WW}` (e.g., `leaderboard:weekly:2026-11`)  
Type: Sorted Set (`ZADD`, `ZREVRANGE`)  
Score: Points earned in that week  
Member: `userId`  
TTL: 8 days (set when key is created)
