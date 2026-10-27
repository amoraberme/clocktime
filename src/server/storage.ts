import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /** A URL the browser can load (signed for S3, an authenticated route for local). */
  url(key: string): Promise<string>;
}

const SAFE_KEY = /^[A-Za-z0-9_\-/.]+$/;
function assertKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error("Invalid storage key");
}

class LocalStorage implements Storage {
  constructor(private root: string) {}
  private file(key: string) {
    assertKey(key);
    return path.join(this.root, key);
  }
  async put(key: string, body: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }
  async get(key: string) {
    try {
      return await readFile(this.file(key));
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
  async url(key: string) {
    assertKey(key);
    return `/api/files/${key}`;
  }
}

class S3Storage implements Storage {
  private client: S3Client;
  constructor(private bucket: string) {
    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    assertKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }
  async get(key: string) {
    assertKey(key);
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async url(key: string) {
    assertKey(key);
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 300,
    });
  }
}

let instance: Storage | null = null;

export function storage(): Storage {
  if (!instance) {
    instance =
      process.env.STORAGE_PROVIDER === "s3" && process.env.S3_BUCKET
        ? new S3Storage(process.env.S3_BUCKET)
        : new LocalStorage(path.join(process.cwd(), "storage"));
  }
  return instance;
}
