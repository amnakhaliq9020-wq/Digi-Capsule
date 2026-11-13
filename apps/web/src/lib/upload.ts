const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export const UPLOAD_HELP =
  "JPEG, PNG, WEBP, or GIF up to 15 MB. MP4, WEBM, or MOV up to 100 MB. The server checks the file again after you choose it.";

export function explainChosenFile(file: File): string | null {
  if (file.size === 0) return "That file is empty. Choose a photo or video that has content.";
  const isPhoto = (PHOTO_TYPES as readonly string[]).includes(file.type);
  const isVideo = (VIDEO_TYPES as readonly string[]).includes(file.type);
  if (!isPhoto && !isVideo) {
    return "Upload a JPEG, PNG, WEBP, GIF, MP4, WEBM, or MOV file.";
  }
  if (isPhoto && file.size > MAX_PHOTO_BYTES) return "Photos must be 15 MB or smaller.";
  if (isVideo && file.size > MAX_VIDEO_BYTES) return "Videos must be 100 MB or smaller.";
  return null;
}

export function explainUploadFailure(err: unknown, fallback = "The upload did not finish. Check your connection and try again."): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    const message = (err as { message: string }).message.trim();
    if (message) return message;
  }
  return fallback;
}
