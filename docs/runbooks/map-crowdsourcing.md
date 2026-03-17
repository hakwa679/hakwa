# Map Crowdsourcing Runbook

## Jobs

- `mapStaleCleanupJob`: nightly stale transition for long-pending features.
- `mapAbuseCheckJob`: nightly voting-ring signal generation.
- `mapWeeklyMissionJob`: weekly mission creation.
- `mapLeaderboardRolloverJob`: monthly archive and reset.

## Redis Keys

- `map:active:geojson`: active layer cache payload.
- `map:leaderboard:monthly:{YYYY-MM}`: monthly leaderboard sorted set.
- `map:leaderboard:monthly:{YYYY-MM}:archive`: archived monthly scores.
- `map:zone:{zoneId}:pct`: cached zone completion percentage.
- `map:features:activated` (pub/sub): feature-activation events.
- `map:roadtrace:events` (stream): trip tracing jobs.

## Moderation Workflow

1. Submission can become `pending_review` via safety checks.
2. Users report via `POST /api/v1/map/features/:id/report`.
3. Moderators inspect queue via `GET /api/v1/admin/map/moderation/queue`.
4. Moderators act via `POST /api/v1/admin/map/features/:id/moderate`.
5. All actions are captured in `map_moderation_log`.

## Troubleshooting

- If active map layer appears stale, refresh by invalidating
  `map:active:geojson` and reloading route `/api/v1/map/features/active`.
- If leaderboard appears frozen, verify gamification stream consumption and
  Redis key writes.
- If missions do not appear, run weekly mission job manually and verify
  `map_mission` rows for current week.
