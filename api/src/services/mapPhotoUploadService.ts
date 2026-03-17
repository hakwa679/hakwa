import { randomUUID } from "node:crypto";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface PrepareMapPhotoUploadInput {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface PrepareMapPhotoUploadOutput {
  uploadUrl: string;
  photoUrl: string;
  expiresAt: string;
}

export function prepareMapPhotoUpload(
  userId: string,
  input: PrepareMapPhotoUploadInput,
): PrepareMapPhotoUploadOutput {
  if (!ALLOWED_MIME.has(input.mimeType)) {
    throw new Error("MAP_PHOTO_INVALID_TYPE");
  }

  if (
    !Number.isFinite(input.fileSizeBytes) ||
    input.fileSizeBytes <= 0 ||
    input.fileSizeBytes > MAX_PHOTO_BYTES
  ) {
    throw new Error("MAP_PHOTO_TOO_LARGE");
  }

  const id = randomUUID();
  const ext = safeExt(input.fileName);
  const key = `map-photos/${userId}/${id}.${ext}`;

  // Placeholder signed URL contract. Swap with cloud storage signer in production.
  const uploadUrl = `https://uploads.hakwa.local/presign/${encodeURIComponent(key)}?token=${id}`;
  const photoUrl = `https://cdn.hakwa.local/${key}`;

  return {
    uploadUrl,
    photoUrl,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

function safeExt(fileName: string): string {
  const last = fileName.split(".").pop()?.toLowerCase();
  if (!last) return "jpg";
  if (["jpg", "jpeg", "png", "webp"].includes(last)) return last;
  return "jpg";
}
