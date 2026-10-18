import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertProjectKey } from "@nora/authz";

export const bucket = () => process.env.S3_BUCKET ?? "nora";

function client(endpoint = process.env.S3_ENDPOINT): S3Client {
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" },
  });
}

let internal: S3Client | undefined;
const s3 = () => (internal ??= client());

/** Every helper takes the project id and refuses keys outside projects/{projectId}/. */
export async function putJson(projectId: string, key: string, value: unknown): Promise<void> {
  assertProjectKey(projectId, key);
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: JSON.stringify(value), ContentType: "application/json" }));
}

export async function getJson<T = unknown>(projectId: string, key: string): Promise<T> {
  assertProjectKey(projectId, key);
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return JSON.parse(await res.Body!.transformToString("utf8")) as T;
}

export async function getBytes(projectId: string, key: string, range?: { start: number; end: number }): Promise<Uint8Array> {
  assertProjectKey(projectId, key);
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: range ? `bytes=${range.start}-${range.end}` : undefined }));
  return res.Body!.transformToByteArray();
}

export async function head(projectId: string, key: string): Promise<{ size: number } | null> {
  assertProjectKey(projectId, key);
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: res.ContentLength ?? 0 };
  } catch (err) {
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** Streams the object once and returns its SHA-256 and byte count, without buffering the whole file. */
export async function sha256(projectId: string, key: string): Promise<{ sha256: string; size: number }> {
  assertProjectKey(projectId, key);
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of res.Body as Readable) {
    hash.update(chunk as Buffer);
    size += (chunk as Buffer).length;
  }
  return { sha256: hash.digest("hex"), size };
}

/**
 * Browser upload URL. `If-None-Match: *` is signed in, so the PUT fails if the raw object already exists:
 * a raw file is written once and never replaced.
 */
export async function presignPut(projectId: string, key: string, expiresInSeconds = 15 * 60): Promise<{ url: string; headers: Record<string, string> }> {
  assertProjectKey(projectId, key);
  const pub = client(process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT);
  const cmd = new PutObjectCommand({ Bucket: bucket(), Key: key, IfNoneMatch: "*" });
  const url = await getSignedUrl(pub, cmd, { expiresIn: expiresInSeconds, signableHeaders: new Set(["if-none-match"]) });
  return { url, headers: { "If-None-Match": "*" } };
}

export async function presignGet(projectId: string, key: string, fileName: string, expiresInSeconds = 5 * 60): Promise<string> {
  assertProjectKey(projectId, key);
  const pub = client(process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT);
  return getSignedUrl(pub, new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\\r\n]/g, "_")}"` }), { expiresIn: expiresInSeconds });
}

/** Removes every object under a prefix inside the project (used by smoke tests and cleanup). */
export async function deletePrefix(projectId: string, prefix: string): Promise<number> {
  assertProjectKey(projectId, prefix);
  let removed = 0;
  let token: string | undefined;
  do {
    const list = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }));
    const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) {
      await s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys } }));
      removed += keys.length;
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  return removed;
}
