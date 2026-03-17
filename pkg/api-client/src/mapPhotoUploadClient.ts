import { HakwaApiClient } from "./index.ts";

export interface PrepareMapPhotoUploadRequest {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface PrepareMapPhotoUploadResponse {
  uploadUrl: string;
  photoUrl: string;
  expiresAt: string;
}

export async function prepareMapPhotoUpload(
  client: HakwaApiClient,
  payload: PrepareMapPhotoUploadRequest,
): Promise<PrepareMapPhotoUploadResponse> {
  return client.post<PrepareMapPhotoUploadResponse>(
    "/api/v1/map/uploads/prepare",
    payload,
  );
}

export async function uploadMapPhotoBinary(
  uploadUrl: string,
  blob: Blob,
  mimeType: string,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": mimeType },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`Map photo upload failed with status ${response.status}`);
  }
}
