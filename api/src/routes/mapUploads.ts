import { Router, type Request, type Response } from "express";
import { getSessionFromRequest } from "@hakwa/auth";
import { prepareMapPhotoUpload } from "../services/mapPhotoUploadService.ts";

export const mapUploadsRouter = Router();

mapUploadsRouter.post("/prepare", async (req: Request, res: Response) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    res
      .status(401)
      .json({ code: "UNAUTHORIZED", message: "Authentication required." });
    return;
  }

  try {
    const body = req.body as {
      fileName: string;
      mimeType: string;
      fileSizeBytes: number;
    };

    const prepared = prepareMapPhotoUpload(session.user.id, body);
    res.status(201).json(prepared);
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "MAP_PHOTO_UPLOAD_FAILED";
    const status = code === "MAP_PHOTO_TOO_LARGE" ? 413 : 422;
    res
      .status(status)
      .json({ code, message: "Unable to prepare map photo upload." });
  }
});
