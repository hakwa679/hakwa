import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { getSessionFromRequest } from "@hakwa/auth";
import { submitMapContribution } from "../services/mapContributionService.ts";
import { listPendingFeaturesInBbox } from "../services/mapQueryService.ts";
import { verifyMapFeature } from "../services/mapVerificationService.ts";
import {
  getActiveMapGeoJson,
  refreshActiveMapGeoJsonCache,
} from "../services/mapRedisService.ts";
import { reportMapFeature } from "../services/mapModerationService.ts";
import { getMyMapStats } from "../services/mapStatsService.ts";
import { getMapLeaderboard } from "../services/mapLeaderboardService.ts";
import {
  listCurrentMissions,
  listMyMissionProgress,
} from "../services/mapMissionService.ts";
import { getZoneDetail } from "../services/mapZoneService.ts";

export const mapRouter = Router();

function readPathParam(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Placeholder routes for spec 009 bootstrap.
mapRouter.get("/health", (_req: Request, res: Response): void => {
  res.json({ service: "map", status: "ok" });
});

mapRouter.post(
  "/features",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        res
          .status(401)
          .json({ code: "UNAUTHORIZED", message: "Authentication required." });
        return;
      }

      const body = req.body as {
        featureType:
          | "poi"
          | "road"
          | "landmark"
          | "hazard"
          | "pickup_spot"
          | "other";
        title?: string;
        description?: string;
        lat: number;
        lng: number;
        geometryJson: string;
        gpsAccuracyMeters?: number;
        photoUrl?: string;
      };

      const result = await submitMapContribution(session.user.id, body);
      res.status(201).json({
        id: result.id,
        status: result.status,
        warning: result.warning,
        createdAt: result.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error) {
        const code = error.message;
        if (code === "MAP_DAILY_LIMIT_REACHED") {
          res
            .status(429)
            .json({ code, message: "Daily map contribution limit reached." });
          return;
        }
        if (code.startsWith("MAP_")) {
          res
            .status(422)
            .json({ code, message: "Invalid map contribution payload." });
          return;
        }
      }
      next(error);
    }
  },
);

mapRouter.get(
  "/features/pending",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        res
          .status(401)
          .json({ code: "UNAUTHORIZED", message: "Authentication required." });
        return;
      }

      const bbox =
        typeof req.query["bbox"] === "string" ? req.query["bbox"] : null;

      const [bboxMinLat, bboxMinLng, bboxMaxLat, bboxMaxLng] = bbox
        ? bbox.split(",").map((v) => Number(v.trim()))
        : [Number.NaN, Number.NaN, Number.NaN, Number.NaN];

      const minLat = Number(req.query["minLat"] ?? bboxMinLat);
      const maxLat = Number(req.query["maxLat"] ?? bboxMaxLat);
      const minLng = Number(req.query["minLng"] ?? bboxMinLng);
      const maxLng = Number(req.query["maxLng"] ?? bboxMaxLng);

      if ([minLat, maxLat, minLng, maxLng].some((v) => Number.isNaN(v))) {
        res.status(422).json({
          code: "MAP_INVALID_BBOX",
          message: "Bounding box query is required.",
        });
        return;
      }

      const limit = Number(req.query["limit"] ?? 20);
      const offset = Number(req.query["offset"] ?? 0);
      const featureTypeParam =
        typeof req.query["featureType"] === "string"
          ? req.query["featureType"]
          : typeof req.query["type"] === "string"
            ? req.query["type"]
            : undefined;
      const featureType =
        typeof featureTypeParam === "string" && featureTypeParam.length > 0
          ? featureTypeParam
          : undefined;
      const maxAgeDays = Number(req.query["maxAgeDays"] ?? 0);
      const sort =
        typeof req.query["sort"] === "string" ? req.query["sort"] : null;

      const allowedSort: Array<
        "oldest" | "newest" | "most_confirmed" | "most_disputed"
      > = ["oldest", "newest", "most_confirmed", "most_disputed"];

      if (sort && !allowedSort.includes(sort as (typeof allowedSort)[number])) {
        res.status(422).json({
          code: "MAP_INVALID_SORT",
          message:
            "sort must be oldest, newest, most_confirmed, or most_disputed.",
        });
        return;
      }

      const pendingQuery: {
        minLat: number;
        maxLat: number;
        minLng: number;
        maxLng: number;
        featureType?: string;
        maxAgeDays?: number;
        sort: "oldest" | "newest" | "most_confirmed" | "most_disputed";
        limit: number;
        offset: number;
      } = {
        minLat,
        maxLat,
        minLng,
        maxLng,
        sort: (sort ?? "newest") as
          | "oldest"
          | "newest"
          | "most_confirmed"
          | "most_disputed",
        limit,
        offset,
      };

      if (featureType) {
        pendingQuery.featureType = featureType;
      }
      if (Number.isFinite(maxAgeDays) && maxAgeDays > 0) {
        pendingQuery.maxAgeDays = maxAgeDays;
      }

      const items = await listPendingFeaturesInBbox(pendingQuery);

      res.json({ items, total: items.length });
    } catch (error) {
      next(error);
    }
  },
);

mapRouter.post(
  "/features/:id/verify",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        res
          .status(401)
          .json({ code: "UNAUTHORIZED", message: "Authentication required." });
        return;
      }

      const body = req.body as {
        vote: "confirm" | "dispute";
        disputeCategory?: string;
      };

      const featureId = readPathParam(req.params.id);
      if (!featureId) {
        res.status(422).json({
          code: "MAP_INVALID_FEATURE_ID",
          message: "Feature id is required.",
        });
        return;
      }

      const result = await verifyMapFeature(session.user.id, featureId, body);
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof Error) {
        const code = error.message;
        if (code === "MAP_ALREADY_VOTED") {
          res
            .status(409)
            .json({ code, message: "Feature already verified by user." });
          return;
        }
        if (code === "MAP_CANNOT_VERIFY_OWN") {
          res
            .status(403)
            .json({ code, message: "Cannot verify your own feature." });
          return;
        }
        if (code === "MAP_VOTING_CLOSED") {
          res.status(409).json({ code, message: "Feature voting is closed." });
          return;
        }
        if (code === "MAP_FEATURE_NOT_FOUND") {
          res.status(404).json({ code, message: "Map feature not found." });
          return;
        }
        if (code.startsWith("MAP_")) {
          res
            .status(422)
            .json({ code, message: "Invalid map verification payload." });
          return;
        }
      }
      next(error);
    }
  },
);

mapRouter.get(
  "/features/active",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        res
          .status(401)
          .json({ code: "UNAUTHORIZED", message: "Authentication required." });
        return;
      }

      const cached = await getActiveMapGeoJson();
      const payload = cached ?? (await refreshActiveMapGeoJsonCache());
      res.setHeader("content-type", "application/json");
      res.status(200).send(payload);
    } catch (error) {
      next(error);
    }
  },
);

mapRouter.post(
  "/features/:id/report",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        res
          .status(401)
          .json({ code: "UNAUTHORIZED", message: "Authentication required." });
        return;
      }

      const body = req.body as { reason: string; note?: string };
      const featureId = readPathParam(req.params.id);
      if (!featureId) {
        res.status(422).json({
          code: "MAP_INVALID_FEATURE_ID",
          message: "Feature id is required.",
        });
        return;
      }

      const result = await reportMapFeature(session.user.id, featureId, body);
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof Error) {
        const code = error.message;
        if (code === "MAP_CANNOT_REPORT_OWN") {
          res.status(403).json({ code, message: "Cannot report own feature." });
          return;
        }
        if (code === "MAP_ALREADY_REPORTED") {
          res.status(409).json({ code, message: "Feature already reported." });
          return;
        }
        if (code === "MAP_VOTING_CLOSED") {
          res.status(409).json({
            code,
            message: "Feature cannot be reported in current state.",
          });
          return;
        }
        if (code === "MAP_FEATURE_NOT_FOUND") {
          res.status(404).json({ code, message: "Map feature not found." });
          return;
        }
      }
      next(error);
    }
  },
);

mapRouter.get(
  "/stats/me",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        res
          .status(401)
          .json({ code: "UNAUTHORIZED", message: "Authentication required." });
        return;
      }

      const stats = await getMyMapStats(session.user.id);
      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  },
);

mapRouter.get(
  "/leaderboard",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        res
          .status(401)
          .json({ code: "UNAUTHORIZED", message: "Authentication required." });
        return;
      }

      const month =
        typeof req.query["month"] === "string" ? req.query["month"] : undefined;

      const leaderboard = await getMapLeaderboard(session.user.id, month);
      res.status(200).json(leaderboard);
    } catch (error) {
      if (error instanceof Error && error.message === "MAP_INVALID_MONTH") {
        res.status(422).json({
          code: "MAP_INVALID_MONTH",
          message: "month must be in YYYY-MM format.",
        });
        return;
      }
      next(error);
    }
  },
);

mapRouter.get(
  "/missions",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        res
          .status(401)
          .json({ code: "UNAUTHORIZED", message: "Authentication required." });
        return;
      }

      const missions = await listCurrentMissions();
      res.status(200).json({ items: missions });
    } catch (error) {
      next(error);
    }
  },
);

mapRouter.get(
  "/missions/me",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        res
          .status(401)
          .json({ code: "UNAUTHORIZED", message: "Authentication required." });
        return;
      }

      const progress = await listMyMissionProgress(session.user.id);
      res.status(200).json({ items: progress });
    } catch (error) {
      next(error);
    }
  },
);

mapRouter.get(
  "/zones/:zoneId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        res
          .status(401)
          .json({ code: "UNAUTHORIZED", message: "Authentication required." });
        return;
      }

      const zoneId = readPathParam(req.params["zoneId"]);
      if (!zoneId) {
        res.status(422).json({
          code: "MAP_INVALID_ZONE_ID",
          message: "zoneId is required.",
        });
        return;
      }

      const zone = await getZoneDetail(zoneId, session.user.id);
      res.status(200).json(zone);
    } catch (error) {
      if (error instanceof Error && error.message === "MAP_ZONE_NOT_FOUND") {
        res.status(404).json({
          code: "MAP_ZONE_NOT_FOUND",
          message: "Map zone not found.",
        });
        return;
      }
      next(error);
    }
  },
);
