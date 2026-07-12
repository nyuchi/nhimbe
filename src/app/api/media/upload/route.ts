/**
 * POST /api/media/upload — cover-image upload to R2.
 *
 * The browser POSTs the raw file as the request body with the image's
 * Content-Type (see `uploadMedia()` in `src/lib/api.ts`). We gate on a WorkOS
 * cookie session, validate type + size, store the object in R2, and return the
 * storage key so the client can render it via `getMediaUrl(key)`.
 *
 * Uploads stream through the Vercel function, so they are bounded by the
 * serverless request-body limit (~4.5 MB). Larger originals should be
 * downscaled client-side or moved to a presigned direct-to-R2 upload later.
 */

import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { isR2Configured, uploadToR2 } from "@/lib/r2";
import { imageBytesMatchType } from "@/lib/security/image";

export const runtime = "nodejs";

// Keep under Vercel's serverless request-body limit.
const MAX_BYTES = 4 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export async function POST(request: Request): Promise<NextResponse> {
  // Only signed-in users may upload.
  let userId: string | undefined;
  try {
    const { user } = await withAuth();
    userId = user?.id;
  } catch {
    userId = undefined;
  }
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Media uploads are not configured" },
      { status: 503 },
    );
  }

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported image type. Use JPEG, PNG, WebP, AVIF, or GIF." },
      { status: 415 },
    );
  }

  const buffer = new Uint8Array(await request.arrayBuffer());
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image is too large (max 4 MB). Please choose a smaller image." },
      { status: 413 },
    );
  }

  // Defence in depth: the Content-Type header is attacker-controlled, so
  // confirm the actual bytes are the image type they claim to be. This
  // rejects a spoofed header smuggling SVG/HTML/polyglot content that could
  // otherwise become stored XSS when served from the assets host.
  if (!imageBytesMatchType(buffer, contentType)) {
    return NextResponse.json(
      { error: "File contents do not match a supported image type." },
      { status: 415 },
    );
  }

  const key = `events/${crypto.randomUUID()}.${ext}`;

  try {
    await uploadToR2(key, buffer, contentType);
  } catch (error) {
    console.error("[mukoko:media] R2 upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  return NextResponse.json({ key, url: key, message: "Uploaded" });
}
