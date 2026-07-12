/**
 * Content-sniffing for uploaded images.
 *
 * The upload route gates on the request's `Content-Type` header, but a header
 * is attacker-controlled: a client can send `Content-Type: image/png` with a
 * body that is actually HTML, SVG or a polyglot. Serving that back from the
 * assets host could turn an "image" upload into stored XSS.
 *
 * `sniffImageType` inspects the leading bytes (the file's magic number) and
 * returns the real MIME type — independent of any header — for the raster
 * formats we accept. Anything it doesn't positively recognise (including SVG,
 * which is XML and script-capable) returns `null` so the caller can reject it.
 */

const ASCII = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

/**
 * Return the detected image MIME type from a buffer's magic bytes, or `null`
 * if the bytes don't match a supported raster image format.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";

  // GIF: "GIF87a" or "GIF89a"
  if (startsWith(bytes, ASCII("GIF87a")) || startsWith(bytes, ASCII("GIF89a"))) return "image/gif";

  // WEBP: "RIFF"<4 bytes>"WEBP"
  if (startsWith(bytes, ASCII("RIFF")) && startsWith(bytes, ASCII("WEBP"), 8)) return "image/webp";

  // AVIF (ISO-BMFF): bytes 4-7 = "ftyp", brand at 8-11 is "avif"/"avis".
  if (
    startsWith(bytes, ASCII("ftyp"), 4) &&
    (startsWith(bytes, ASCII("avif"), 8) || startsWith(bytes, ASCII("avis"), 8))
  ) {
    return "image/avif";
  }

  return null;
}

/** True when the buffer's magic bytes match the declared MIME type exactly. */
export function imageBytesMatchType(bytes: Uint8Array, declaredType: string): boolean {
  const sniffed = sniffImageType(bytes);
  return sniffed !== null && sniffed === declaredType;
}
