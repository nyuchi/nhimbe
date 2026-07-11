/**
 * Cloudflare R2 upload helper (server-only).
 *
 * R2 is S3-compatible, so we talk to it with the AWS S3 SDK pointed at the
 * account's R2 endpoint. Objects land in the shared Mukoko bucket
 * (`mukoko-storage`) and are read back over its public domain via
 * `getMediaUrl()` in `src/lib/api.ts` — uploads and reads share one bucket, so
 * a freshly uploaded key is immediately serveable at
 * `${NEXT_PUBLIC_ASSETS_URL}/<key>`.
 *
 * Credentials are read from the environment and never reach the client:
 *   R2_ACCOUNT_ID        — Cloudflare account id (forms the S3 endpoint)
 *   R2_ACCESS_KEY_ID     — R2 S3 API token access key id
 *   R2_SECRET_ACCESS_KEY — R2 S3 API token secret
 *   R2_BUCKET            — bucket name (defaults to `mukoko-storage`)
 *
 * When any required credential is missing, `isR2Configured()` is false and
 * callers surface a clear "not configured" error instead of throwing on a
 * malformed client.
 */

import "server-only";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET ?? "mukoko-storage";

export function isR2Configured(): boolean {
  return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY);
}

let cachedClient: S3Client | null = null;

function getR2Client(): S3Client {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured (missing R2_* environment variables)");
  }
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ACCESS_KEY_ID as string,
        secretAccessKey: SECRET_ACCESS_KEY as string,
      },
    });
  }
  return cachedClient;
}

/**
 * Upload bytes to R2 under `key`. Returns the same key on success so callers
 * can build a public URL with `getMediaUrl(key)`.
 */
export async function uploadToR2(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return key;
}
