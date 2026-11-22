import { exports } from "cloudflare:workers";
import { ipOf } from "./fixtures";

const enc = (s: string) => new TextEncoder().encode(s);

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const u32be = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const u32le = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  const len = payload.length + 2;
  return concat(new Uint8Array([0xff, marker, len >> 8, len & 255]), payload);
}

/** A structurally valid JPEG with a JFIF header, an Exif block holding "GPS" data and unique scan bytes. */
export function jpegWithExif(seed = crypto.randomUUID()): Uint8Array {
  return concat(
    new Uint8Array([0xff, 0xd8]),
    jpegSegment(0xe0, enc("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    jpegSegment(0xe1, enc("Exif\0\0MM\0*GPSLatitude=52.52;GPSLongitude=13.40")),
    jpegSegment(0xdb, new Uint8Array(65)),
    jpegSegment(0xc0, new Uint8Array([8, 0, 1, 0, 1, 1, 1, 0x11, 0])),
    jpegSegment(0xda, new Uint8Array([1, 1, 0, 0, 63, 0])),
    enc(`PIXELS-${seed}`),
    new Uint8Array([0xff, 0xd9]),
  );
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  return concat(u32be(data.length), enc(type), data, new Uint8Array(4));
}

export function pngWithExif(): Uint8Array {
  return concat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", concat(u32be(1), u32be(1), new Uint8Array([8, 2, 0, 0, 0]))),
    pngChunk("eXIf", enc("MM\0*GPS")),
    pngChunk("tEXt", enc("Comment\0GPS somewhere")),
    pngChunk("IDAT", enc("PIXELS")),
    pngChunk("IEND", new Uint8Array(0)),
  );
}

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  return concat(enc(type), u32le(data.length), data, data.length % 2 ? new Uint8Array(1) : new Uint8Array(0));
}

export function webpWithExif(): Uint8Array {
  const body = concat(
    enc("WEBP"),
    webpChunk("VP8X", new Uint8Array([0x08, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
    webpChunk("VP8L", concat(new Uint8Array([0x2f, 0, 0, 0, 0]), enc("PIXELS"))),
    webpChunk("EXIF", enc("MM\0*GPS")),
  );
  return concat(enc("RIFF"), u32le(body.length), body);
}

export type UploadFields = {
  photo?: Uint8Array | null;
  photoType?: string;
  consent?: string | null;
  restaurantId?: string;
  restaurantName?: string;
  newRestaurant?: object;
  kiez?: string;
};

/** Posts a multipart upload like the app does. */
export async function upload(fields: UploadFields = {}, init: { ip?: string; cookie?: string } = {}) {
  const form = new FormData();
  const photo = fields.photo === undefined ? jpegWithExif() : fields.photo;
  if (photo) form.append("photo", new File([photo], "menu.jpg", { type: fields.photoType ?? "image/jpeg" }));
  if (fields.consent !== null) form.append("consent", fields.consent ?? "1");
  if (fields.restaurantId) form.append("restaurantId", fields.restaurantId);
  if (fields.restaurantName) form.append("restaurantName", fields.restaurantName);
  if (fields.newRestaurant) form.append("newRestaurant", JSON.stringify(fields.newRestaurant));
  if (fields.kiez) form.append("kiez", fields.kiez);
  const headers: Record<string, string> = { "cf-connecting-ip": init.ip ?? ipOf("uploader") };
  if (init.cookie) headers.cookie = init.cookie;
  const res = await exports.default.fetch(new Request("https://app.test/api/submissions", { method: "POST", body: form, headers }));
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}
