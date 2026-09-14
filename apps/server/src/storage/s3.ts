import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

let client: S3Client | null = null;
let publicClient: S3Client | null = null;

function makeClient(endpoint: string) {
  const cfg = config();
  return new S3Client({
    endpoint,
    region: cfg.S3_REGION,
    forcePathStyle: cfg.S3_URL_STYLE === "path",
    credentials: { accessKeyId: cfg.S3_ACCESS_KEY_ID, secretAccessKey: cfg.S3_SECRET_ACCESS_KEY },
  });
}

/** Клиент для внутренних операций (скачать/удалить). */
export function s3(): S3Client {
  client ??= makeClient(config().S3_ENDPOINT);
  return client;
}

/** Клиент для presigned URL, которые уходят наружу (телефон, ElevenLabs). */
function s3Public(): S3Client {
  const cfg = config();
  if (!cfg.S3_PUBLIC_ENDPOINT) return s3();
  publicClient ??= makeClient(cfg.S3_PUBLIC_ENDPOINT);
  return publicClient;
}

export const bucket = () => config().S3_BUCKET;

export function objectKey(meetingId: string, kind: "segment" | "merged" | "import", seq = 0, ext = "m4a") {
  return kind === "segment" ? `meetings/${meetingId}/segments/${String(seq).padStart(4, "0")}.${ext}` : `meetings/${meetingId}/${kind}.${ext}`;
}

export async function presignPut(key: string, contentType: string, expiresSec = 15 * 60): Promise<string> {
  return getSignedUrl(s3Public(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), {
    expiresIn: expiresSec,
  });
}

export async function presignGet(key: string, expiresSec = 2 * 60 * 60): Promise<string> {
  return getSignedUrl(s3Public(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: expiresSec });
}

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType };
  } catch (e) {
    if ((e as { name?: string }).name === "NotFound" || (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

export async function putObject(key: string, body: Buffer | Uint8Array, contentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function getObjectBytes(key: string): Promise<Buffer> {
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const bytes = await r.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Пустой объект ${key}`);
  return Buffer.from(bytes);
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function deleteObjects(keys: string[]) {
  if (keys.length === 0) return;
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
  }
}

export async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const r = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }));
    for (const o of r.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
