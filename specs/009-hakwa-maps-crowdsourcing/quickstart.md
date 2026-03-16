# Quickstart: Hakwa Maps — Crowdsourced Data Collection

## Prerequisites

- Specs 001–007 schema applied (`db-push` already run for `user`,
  `pointsAccount`, etc.)
- `@hakwa/db`, `@hakwa/redis`, `@hakwa/workers`, `@hakwa/core` packages built.

---

## Step 1: Add Map Schema

Create `pkg/db/schema/map.ts` with all map tables (see
[data-model.md](data-model.md)):

- `mapFeature`
- `mapVote`
- `mapRoadTrace`
- `mapZone`
- `mapMission`
- `mapMissionProgress`

Export from `pkg/db/schema/index.ts`:

```typescript
export * from "./map";
```

Apply:

```bash
cd pkg/db && npm run db-push
```

Seed initial zones and mission templates:

```bash
npx tsx api/src/jobs/seedMapZones.ts
npx tsx api/src/jobs/missionTemplates.ts
```

---

## Step 2: Add Geometry Utilities to `@hakwa/core`

```typescript
// pkg/core/src/geometry/validate.ts
export function validateGeoJSON(raw: string): {
  valid: boolean;
  error?: string;
} {
  try {
    const geo = JSON.parse(raw);
    if (!["Point", "LineString", "Polygon"].includes(geo.type)) {
      return { valid: false, error: "Unsupported geometry type" };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid JSON" };
  }
}

export const MAX_COORDINATE_PRECISION = 6;

// pkg/core/src/geometry/rdp.ts
export function rdpSimplify(
  points: [number, number][],
  tolerance = 0.00001,
): [number, number][] {
  // Ramer-Douglas-Peucker implementation
  if (points.length <= 2) return points;
  // ... standard RDP algorithm
  return simplified;
}
```

---

## Step 3: Map Contribution Routes

```typescript
// api/src/routes/map.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  submitFeature,
  voteFeature,
  getFeatures,
  submitRoadTrace,
} from "../services/mapService";

const router = Router();

// Submit a new map feature
router.post("/features", requireAuth, submitFeature);

// Submit road trace
router.post("/road-traces", requireAuth, submitRoadTrace);

// Get features in bounding box
router.get("/features", getFeatures);

// Vote on a feature
router.post("/features/:featureId/vote", requireAuth, voteFeature);

// Get active missions
router.get("/missions", requireAuth, getMissions);

// Get my mission progress
router.get("/missions/me", requireAuth, getMyMissions);

export default router;
```

Mount in `api/src/index.ts`:

```typescript
app.use("/api/map", mapRouter);
```

---

## Step 4: Offline Queue (Mobile)

```typescript
// pkg/api-client/src/mapContributionQueue.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

const QUEUE_KEY = "hakwa:map:contribution_queue";

export interface QueuedContribution {
  localId: string;
  payload: SubmitFeatureRequest;
  createdAt: string;
}

export async function enqueueContribution(
  payload: SubmitFeatureRequest,
): Promise<void> {
  const existing = await getQueue();
  existing.push({
    localId: crypto.randomUUID(),
    payload,
    createdAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(existing));
}

export async function drainQueue(apiClient: HakwaApiClient): Promise<void> {
  const queue = await getQueue();
  if (queue.length === 0) return;

  const remaining: QueuedContribution[] = [];
  for (const item of queue) {
    try {
      await apiClient.post("/api/map/features", item.payload);
    } catch {
      remaining.push(item); // keep failed items for next drain
    }
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}

async function getQueue(): Promise<QueuedContribution[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}
```

Register listener in app root:

```typescript
NetInfo.addEventListener((state) => {
  if (state.isConnected) drainQueue(apiClient);
});
```

---

## Step 5: Mission Scheduler

```typescript
// api/src/jobs/weeklyMissions.ts
import cron from "node-cron";
import { db } from "@hakwa/db";
import { mapMission } from "@hakwa/db/schema";
import { MISSION_TEMPLATES } from "./missionTemplates";

// Every Monday at 00:01 UTC
cron.schedule("1 0 * * 1", async () => {
  const weekStart = currentMondayISO();
  const templates = MISSION_TEMPLATES.sort(() => Math.random() - 0.5).slice(
    0,
    3,
  );

  for (const template of templates) {
    await db
      .insert(mapMission)
      .values({ ...template, weekStart, status: "active" })
      .onConflictDoNothing();
  }
});
```

---

## Step 6: Verify

```bash
# 1. Submit a POI
POST /api/map/features
{
  "type": "poi",
  "name": "Suva Market",
  "category": "market",
  "geometry_json": "{\"type\":\"Point\",\"coordinates\":[178.4415,-18.1416]}"
}
# → 201, status: "pending"

# 2. Vote on the feature (from two trusted users)
POST /api/map/features/:featureId/vote { "vote": "confirm" }
POST /api/map/features/:featureId/vote { "vote": "confirm" }
# → Once confirm_count meets AUTO_ACTIVATE threshold: status = "active"

# 3. Check map features in bounding box
GET /api/map/features?minLat=-18.2&maxLat=-18.0&minLng=178.3&maxLng=178.6
# → features array with status = "active"

# 4. Check gamification points were awarded via Redis Stream
GET /api/me/gamification
# → totalPoints includes map_contribution points
```
