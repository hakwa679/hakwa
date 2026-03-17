# @hakwa/db

## Map Schema (Spec 009)

The map schema is defined in pkg/db/schema/map.ts and exported via
pkg/db/schema/index.ts.

### Apply schema changes

Run from repository root:

```bash
npm run db-push
```

Or directly in the package:

```bash
npm run push -w @hakwa/db
```

### Verification checklist

- Confirm DATABASE_URL is set.
- Run drizzle push and verify no migration errors.
- Verify tables are visible in the target database:
  - map_feature
  - map_verification
  - map_contributor_stats
  - map_zone
  - map_mission
  - map_mission_progress
  - map_road_trace
  - map_feature_report
  - map_contributor_trust
  - map_moderation_log
  - map_abuse_flag
