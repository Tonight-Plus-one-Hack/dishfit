import { apiError, badRequest } from "../lib/http";
import { MAX_PHOTO_BYTES, PhotoFormatError, PHOTO_TYPES, sniffPhotoType, stripPhotoMetadata, type PhotoType } from "./image";

const MAX_BODY_BYTES = MAX_PHOTO_BYTES + 64 * 1024;
const photoTooLarge = () => apiError("payload_too_large", "Photo is larger than 5 MB.", 413);
const wrongPhotoType = () => apiError("unsupported_media_type", "Only JPEG, PNG or WebP photos.", 415);

export function checkPhotoUpload(request: Request): Response | null {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return photoTooLarge();
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "multipart/form-data" ? null : badRequest("Expected multipart/form-data.");
}

/** Count the actual multipart bytes before passing them to the built-in form parser. */
export async function readPhotoForm(request: Request): Promise<FormData | Response> {
  if (!request.body) return badRequest("Unreadable form data.");
  let size = 0;
  let tooLarge = false;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        controller.error(new RangeError("Photo request exceeds the byte limit"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
  try {
    const contentType = request.headers.get("content-type")!;
    return await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch {
    return tooLarge ? photoTooLarge() : badRequest("Unreadable form data.");
  }
}

export async function readUploadedPhoto(form: FormData): Promise<{ bytes: Uint8Array; type: PhotoType } | Response> {
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return badRequest("A photo is required.");
  if (photo.size > MAX_PHOTO_BYTES) return photoTooLarge();
  if (photo.type && photo.type !== "application/octet-stream" && !PHOTO_TYPES.some((type) => photo.type === type)) {
    return wrongPhotoType();
  }
  const raw = new Uint8Array(await photo.arrayBuffer());
  const type = sniffPhotoType(raw);
  if (!type) return wrongPhotoType();
  try {
    return { bytes: stripPhotoMetadata(raw, type), type };
  } catch (error) {
    if (error instanceof PhotoFormatError) return apiError("unsupported_media_type", "The photo file is broken.", 415);
    throw error;
  }
}
