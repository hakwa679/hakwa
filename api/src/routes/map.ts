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

export const mapRouter = Router();

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

      const minLat = Number(req.query["minLat"]);
      const maxLat = Number(req.query["maxLat"]);
      const minLng = Number(req.query["minLng"]);
      const maxLng = Number(req.query["maxLng"]);

      if ([minLat, maxLat, minLng, maxLng].some((v) => Number.isNaN(v))) {
        res.status(422).json({
          code: "MAP_INVALID_BBOX",
          message: "Bounding box query is required.",
        });
        return;
      }

      const limit = Number(req.query["limit"] ?? 20);
      const offset = Number(req.query["offset"] ?? 0);
      const featureType =
        typeof req.query["featureType"] === "string"
          ? req.query["featureType"]
          : undefined;

      const items = await listPendingFeaturesInBbox({
        minLat,
        maxLat,
        minLng,
        maxLng,
        featureType,
        limit,
        offset,
      });

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

      const result = await verifyMapFeature(
        session.user.id,
        req.params.id,
        body,
      );
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
      const result = await reportMapFeature(
        session.user.id,
        req.params.id,
        body,
      );
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
          res
            .status(409)
            .json({
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
