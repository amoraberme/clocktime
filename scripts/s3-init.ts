/**
 * Creates the S3 bucket for the local production copy if it doesn't exist yet (R2 buckets are
 * created in the Cloudflare dashboard instead). Retries while the storage service starts.
 *
 *   pnpm exec tsx scripts/s3-init.ts
 */
import "dotenv/config";
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const bucket = process.env.S3_BUCKET;
if (process.env.STORAGE_PROVIDER !== "s3" || !bucket) {
  console.log("STORAGE_PROVIDER is not s3: nothing to create.");
  process.exit(0);
}
const client = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

for (let attempt = 1; ; attempt++) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Bucket "${bucket}" is ready.`);
    break;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`Created bucket "${bucket}".`);
      break;
    }
    if (attempt >= 30) throw err;
    console.log(`Storage not ready (${status ?? (err as Error).message}); retrying…`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
