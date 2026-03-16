# API Contracts: Gamification System

All endpoints require `Authorization: Bearer <session-token>`.

---

## User Profile — Points & Level

### `GET /api/me/gamification`

Returns the authenticated user's gamification profile.

**Response 200**:

```json
{
  "totalPoints": 1250,
  "referralCode": "HAKWA-A3X7",
  "currentLevel": {
    "number": 4,
    "name": "Navigator",
    "minPoints": 1000
  },
  "nextLevel": {
    "number": 5,
    "name": "Explorer",
    "minPoints": 2000,
    "pointsToGo": 750
  },
  "currentStreak": 5,
  "longestStreak": 12,
  "badges": [
    {
      "slug": "first_trip",
      "name": "First Trip",
      "iconUrl": "/assets/badges/first_trip.png",
      "awardedAt": "2026-03-01T08:00:00Z"
    }
  ]
}
```

---

### `GET /api/me/gamification/history?cursor=<id>&limit=20`

Paginated points ledger history.

**Response 200**:

```json
{
  "items": [
    {
      "id": "uuid",
      "sourceAction": "trip_completed",
      "points": 10,
      "description": "Trip completed",
      "createdAt": "2026-03-17T09:20:00Z"
    }
  ],
  "nextCursor": "uuid | null"
}
```

---

## Leaderboard

### `GET /api/gamification/leaderboard?week=2026-11`

Weekly leaderboard — top 10 users by points earned that week.

**Response 200**:

```json
{
  "week": "2026-11",
  "entries": [
    {
      "rank": 1,
      "userId": "uuid",
      "displayName": "Anika P.",
      "points": 340,
      "avatarUrl": null
    },
    {
      "rank": 2,
      "userId": "uuid",
      "displayName": "Seru T.",
      "points": 290,
      "avatarUrl": null
    }
  ],
  "myRank": 7,
  "myPoints": 120
}
```

Data sourced from Redis Sorted Set `leaderboard:weekly:{week}`. Display names
are looked up from `userProfile` by userId batch. Anonymous users show initials
only.

---

## Referral

### `GET /api/me/referrals`

Referral summary for the authenticated user.

**Response 200**:

```json
{
  "referralCode": "HAKWA-A3X7",
  "referralLink": "https://hakwa.app/r/HAKWA-A3X7",
  "totalReferrals": 8,
  "rewardsEarned": 3,
  "capReached": false,
  "cap": 20
}
```

---

## WebSocket Events (Inbound — sent to user)

Channel: `user:{userId}:gamification`

| Event              | Payload                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `points_earned`    | `{ amount: 10, sourceAction: "trip_completed", totalPoints: 1250 }`     |
| `level_up`         | `{ newLevel: { number: 4, name: "Navigator" }, totalPoints: 1000 }`     |
| `badge_earned`     | `{ badge: { slug: "first_trip", name: "First Trip", iconUrl: "..." } }` |
| `streak_milestone` | `{ streak: 7, bonusPoints: 25 }`                                        |
| `referral_capped`  | `{ cap: 20 }`                                                           |
