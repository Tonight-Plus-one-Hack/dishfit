/**
 * Upload checks for guests' menu photos: the real type from the magic bytes (never the declared
 * Content-Type), bounded raster dimensions and a container rewrite that drops EXIF and other
 * non-rendering blocks. The app also re-encodes its photos through a canvas.
 */

export type PhotoType = "image/jpeg" | "image/png" | "image/webp";

/** The app sends WebP under 1 MB (apps/web/src/lib/photo.ts); anything above 5 MB is refused. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES: readonly PhotoType[] = ["image/jpeg", "image/png", "image/webp"];

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));

/** The image type from the file's first bytes; null for anything else. */
export function sniffPhotoType(b: Uint8Array): PhotoType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 7) === "PNG\r\n\x1a\n") return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  return null;
}

export class PhotoFormatError extends Error {}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const MAX_EDGE = 8192;
const MAX_PIXELS = 32_000_000;
const MAX_SEGMENTS = 4096;

function checkDimensions(width: number, height: number) {
  if (width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
    throw new PhotoFormatError("Unsupported photo dimensions");
  }
}

function jpegMetadata(marker: number, part: Uint8Array): boolean {
  if (marker === 0xe0 && part.length === 18 && ascii(part, 4, 5) === "JFIF\0" && part[16] === 0 && part[17] === 0) return false;
  if (marker === 0xee && part.length === 16 && ascii(part, 4, 5) === "Adobe") return false;
  return marker === 0xfe || (marker >= 0xe0 && marker <= 0xef);
}

/** Walk the scans too so progressive JPEGs cannot retain metadata between scans. */
function* jpegSegments(b: Uint8Array): Generator<{ marker: number; part: Uint8Array }> {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let sawFrame = false;
  let sawScan = false;
  let i = 2;
  for (let segments = 0; i + 2 <= b.length && segments < MAX_SEGMENTS; segments++) {
    if (b[i] !== 0xff) throw new PhotoFormatError("Broken JPEG segment");
    if (b[i + 1] === 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1]!;
    if (marker === 0xd9 && sawFrame && sawScan) {
      yield { marker, part: b.subarray(i, i + 2) };
      return;
    }
    if (marker < 0xc0 || (marker >= 0xd0 && marker <= 0xd9) || i + 4 > b.length) {
      throw new PhotoFormatError("Invalid JPEG marker");
    }
    const len = view.getUint16(i + 2);
    if (len < 2 || i + 2 + len > b.length) throw new PhotoFormatError("Broken JPEG segment length");
    const end = i + 2 + len;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (len < 8 || sawFrame) throw new PhotoFormatError("Broken JPEG frame");
      checkDimensions(view.getUint16(i + 7), view.getUint16(i + 5));
      sawFrame = true;
    }
    yield { marker, part: b.subarray(i, end) };
    i = end;
    if (marker !== 0xda) continue;
    if (!sawFrame || len < 6) throw new PhotoFormatError("Broken JPEG scan");
    sawScan = true;
    // Inside a scan, FF00 is a stuffed byte and FFD0 through FFD7 are restart markers.
    for (let next = b.indexOf(0xff, end); next >= 0; next = b.indexOf(0xff, next + 1)) {
      const following = b[next + 1];
      if (following === 0 || following === 0xff || (following !== undefined && following >= 0xd0 && following <= 0xd7)) continue;
      i = next;
      break;
    }
    if (i === end) throw new PhotoFormatError("JPEG without scan data");
    yield { marker: -1, part: b.subarray(end, i) };
  }
  throw new PhotoFormatError("JPEG without end marker");
}

const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "cICP"]);

function stripPng(b: Uint8Array): Uint8Array {
  if (b.length < 33 || ascii(b, 12, 4) !== "IHDR") throw new PhotoFormatError("PNG without header");
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (view.getUint32(8) !== 13) throw new PhotoFormatError("Broken PNG header");
  checkDimensions(view.getUint32(16), view.getUint32(20));
  let sawData = false;
  let i = 8;
  for (let chunks = 0; i + 12 <= b.length && chunks < MAX_SEGMENTS; chunks++) {
    const len = view.getUint32(i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) throw new PhotoFormatError("Broken PNG chunk");
    if (type === "IHDR" && i !== 8) throw new PhotoFormatError("Multiple PNG headers");
    if (type === "IEND") {
      if (len !== 0 || !sawData) throw new PhotoFormatError("Incomplete PNG image");
      parts.push(b.subarray(i, end));
      return concat(parts);
    }
    if (type === "acTL" || type === "fcTL" || type === "fdAT") throw new PhotoFormatError("Animated PNG is unsupported");
    if (type === "IDAT" && len > 0) sawData = true;
    if (PNG_KEEP.has(type)) parts.push(b.subarray(i, end));
    else if ((b[i + 4]! & 0x20) === 0) throw new PhotoFormatError("Unknown critical PNG chunk");
    i = end;
  }
  throw new PhotoFormatError("PNG without IEND");
}

const WEBP_KEEP = new Set(["VP8X", "VP8 ", "VP8L", "ALPH"]);

function stripWebp(b: Uint8Array): Uint8Array {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const riffEnd = view.getUint32(4, true) + 8;
  if (riffEnd > b.length) throw new PhotoFormatError("Incomplete WebP file");
  const chunks: Uint8Array[] = [];
  let sawImage = false;
  let i = 12;
  for (let chunkCount = 0; i + 8 <= riffEnd && chunkCount < MAX_SEGMENTS; chunkCount++) {
    const type = ascii(b, i, 4);
    const len = view.getUint32(i + 4, true);
    const end = i + 8 + len + (len % 2);
    if (end > riffEnd) throw new PhotoFormatError("Broken WebP chunk");
    if (type === "ANIM" || type === "ANMF") throw new PhotoFormatError("Animated WebP is unsupported");
    const data = i + 8;
    if (type === "VP8 " || type === "VP8L") {
      if (sawImage) throw new PhotoFormatError("Multiple WebP images");
      if (type === "VP8 ") {
        if (len < 10 || b[data + 3] !== 0x9d || b[data + 4] !== 0x01 || b[data + 5] !== 0x2a) throw new PhotoFormatError("Broken VP8 header");
        checkDimensions(view.getUint16(data + 6, true) & 0x3fff, view.getUint16(data + 8, true) & 0x3fff);
      } else {
        if (len < 5 || b[data] !== 0x2f) throw new PhotoFormatError("Broken VP8L header");
        const size = view.getUint32(data + 1, true);
        checkDimensions((size & 0x3fff) + 1, ((size >>> 14) & 0x3fff) + 1);
      }
      sawImage = true;
    }
    if (WEBP_KEEP.has(type)) {
      const chunk = b.slice(i, end);
      if (len % 2) chunk[chunk.length - 1] = 0;
      if (type === "VP8X") {
        if (len !== 10 || (chunk[8]! & 0x02)) throw new PhotoFormatError("Unsupported WebP header");
        const dimension = (offset: number) => 1 + (chunk[offset]! | (chunk[offset + 1]! << 8) | (chunk[offset + 2]! << 16));
        checkDimensions(dimension(12), dimension(15));
        chunk[8] = chunk[8]! & ~0x2c; // Clear the ICC, EXIF and XMP flags for the omitted chunks.
      }
      chunks.push(chunk);
    }
    i = end;
  }
  if (i !== riffEnd || !sawImage) throw new PhotoFormatError("WebP without complete image data");
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, chunks.reduce((length, chunk) => length + chunk.length, 4), true);
  return concat([header, ...chunks]);
}

/** The photo without metadata blocks. Throws PhotoFormatError for a broken file. */
export function stripPhotoMetadata(b: Uint8Array, type: PhotoType): Uint8Array {
  if (type === "image/jpeg") {
    const parts = [b.subarray(0, 2)];
    for (const { marker, part } of jpegSegments(b)) if (!jpegMetadata(marker, part)) parts.push(part);
    return concat(parts);
  }
  if (type === "image/png") return stripPng(b);
  return stripWebp(b);
}

/** Names of the metadata blocks still in the file (walks the structure, never the pixel data). */
export function metadataBlocks(b: Uint8Array, type: PhotoType): string[] {
  const found: string[] = [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (type === "image/jpeg") {
    for (const { marker, part } of jpegSegments(b)) if (jpegMetadata(marker, part)) found.push(`0x${marker.toString(16)}`);
  } else if (type === "image/png") {
    for (let i = 8; i + 12 <= b.length; i += 12 + view.getUint32(i)) {
      const t = ascii(b, i + 4, 4);
      if (!PNG_KEEP.has(t)) found.push(t);
      if (t === "IEND") break;
    }
  } else {
    for (let i = 12; i + 8 <= b.length; ) {
      const t = ascii(b, i, 4);
      const len = view.getUint32(i + 4, true);
      if (!WEBP_KEEP.has(t)) found.push(t.trim());
      i += 8 + len + (len % 2);
    }
  }
  return found;
}

export async function sha256Hex(b: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", b);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
