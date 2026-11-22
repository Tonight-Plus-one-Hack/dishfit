import { notFound, type RouteContext } from "../lib/http";
import { photoResponse, photoStore } from "../lib/photo-store";

const AI_IMAGE_KEY = /^ai\/[a-z0-9-]{1,128}\.(webp|png|jpg)$/;

/** GET /api/images/ai/:file: an AI dish image from the photo store (always labeled "AI image" in the UI). */
export async function aiImage({ env, params }: RouteContext): Promise<Response> {
  const key = `ai/${params.file ?? ""}`;
  if (!AI_IMAGE_KEY.test(key)) return notFound("Image not found");
  const object = await photoStore(env)?.get(key);
  if (!object) return notFound("Image not found");
  return photoResponse(object.bytes, object.contentType, "public, max-age=86400");
}
