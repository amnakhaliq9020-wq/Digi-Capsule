import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../env";

export interface StoragePort {
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  open(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

function safeKey(key: string): string {
  if (!/^[a-zA-Z0-9/_-]+$/.test(key) || key.includes("..")) {
    throw new Error("Invalid storage key.");
  }
  return key;
}

class LocalStorage implements StoragePort {
  constructor(private root: string) {}

  private full(key: string): string {
    const resolvedRoot = path.resolve(this.root);
    const full = path.resolve(resolvedRoot, safeKey(key));
    if (!full.startsWith(resolvedRoot)) throw new Error("Invalid storage key.");
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.full(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async open(key: string): Promise<Readable> {
    return createReadStream(this.full(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.full(key), { force: true });
  }
}

class S3Storage implements StoragePort {
  private client: S3Client;
  constructor(
    private bucket: string,
    endpoint: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    forcePathStyle: boolean,
  ) {
    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: body, ContentType: mimeType }),
    );
  }

  async open(key: string): Promise<Readable> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
    if (!result.Body) throw new Error("Empty object.");
    return result.Body as Readable;
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
  }
}

export function createStorage(): StoragePort {
  if (env.STORAGE_DRIVER === "s3") {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error("S3 storage requires S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.");
    }
    return new S3Storage(
      env.S3_BUCKET,
      env.S3_ENDPOINT,
      env.S3_REGION,
      env.S3_ACCESS_KEY_ID,
      env.S3_SECRET_ACCESS_KEY,
      env.S3_FORCE_PATH_STYLE === "true",
    );
  }
  return new LocalStorage(path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR));
}
