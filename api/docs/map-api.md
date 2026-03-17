# Map API

Base path: `/api/v1/map`

## Submit Contribution

- Method: `POST /features`
- Auth: required
- Body fields: `featureType`, `lat`, `lng`, `geometryJson`, optional `title`,
  `description`, `photoUrl`
- Success: `201` with `{ id, status, warning?, createdAt }`

## Browse Pending Features

- Method: `GET /features/pending`
- Auth: required
- Query: `minLat`, `minLng`, `maxLat`, `maxLng`, optional `featureType`,
  `maxAgeDays`, `sort`, `limit`, `offset`
- Success: `200` with `{ items, total }`

## Verify Feature

- Method: `POST /features/:id/verify`
- Auth: required
- Body fields: `vote` (`confirm` or `dispute`), optional `disputeCategory`
- Success: `201` with `{ id, status, confirmCount, disputeCount }`

## Active Feature Layer

- Method: `GET /features/active`
- Auth: required
- Success: `200` GeoJSON `FeatureCollection`

## Report Feature

- Method: `POST /features/:id/report`
- Auth: required
- Body fields: `reason`, optional `note`

## Stats

- Method: `GET /stats/me`
- Auth: required
- Success: `200` with contribution, verification, streak, trust, and impact
  fields

## Leaderboard

- Method: `GET /leaderboard`
- Auth: required
- Query: optional `month` (`YYYY-MM`)
- Success: `200` with `{ month, entries, callerRank }`

## Missions

- Method: `GET /missions`
- Auth: required
- Success: `200` with `{ items }`

- Method: `GET /missions/me`
- Auth: required
- Success: `200` with `{ items }`

## Zone Detail

- Method: `GET /zones/:zoneId`
- Auth: required
- Success: `200` with zone completion, top contributors, and pioneer card
