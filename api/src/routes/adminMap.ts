import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { requireMapModerator } from "../middleware/requireMapModerator.ts";
import {
  listModerationQueue,
  moderateMapFeature,
} from "../services/mapModerationService.ts";

export const adminMapRouter = Router();

adminMapRouter.use(requireMapModerator);

adminMapRouter.get(
  "/moderation/queue",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Number(req.query["limit"] ?? 20);
      const offset = Number(req.query["offset"] ?? 0);
      const items = await listModerationQueue({ limit, offset });
      res.json({ items, total: items.length });
    } catch (error) {
      next(error);
    }
  },
);

adminMapRouter.post(
  "/features/:id/moderate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const moderator = res.locals["mapModerator"] as { userId: string };
      const body = req.body as {
        action: "approve" | "reject" | "warn_contributor" | "ban_contributor";
        reason?: string;
      };
      const featureId = req.params["id"];
      if (typeof featureId !== "string" || featureId.length === 0) {
        res
          .status(422)
          .json({
            code: "MAP_INVALID_FEATURE_ID",
            message: "Feature id is required.",
          });
        return;
      }

      const result = await moderateMapFeature({
        featureId,
        moderatorId: moderator.userId,
        action: body.action,
        ...(body.reason ? { reason: body.reason } : {}),
      });

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "MAP_FEATURE_NOT_FOUND") {
        res
          .status(404)
          .json({ code: error.message, message: "Map feature not found." });
        return;
      }
      next(error);
    }
  },
);
