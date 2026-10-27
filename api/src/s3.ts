import {
  S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand, CreateBucketCommand, HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { config } from './config.js';

const base = {
  region: config.s3.region,
  forcePathStyle: true,
  credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
  // Newer SDKs add checksum headers by default; browsers uploading to a presigned URL can't send them.
  requestChecksumCalculation: 'WHEN_REQUIRED' as const,
  responseChecksumValidation: 'WHEN_REQUIRED' as const,
};

/** Talks to MinIO directly over the Docker network (API + worker). */
export const s3 = new S3Client({ ...base, endpoint: config.s3.endpoint });

/**
 * Signs URLs for browsers. They are signed for PUBLIC_URL's host, and Caddy forwards
 * /<bucket>/* to MinIO with that same Host header, so the signature still matches.
 */
const signer = new S3Client({ ...base, endpoint: config.s3.publicUrl });

const Bucket = config.s3.bucket;

export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket }));
  }
}

export const presignPut = (key: string, contentType: string) =>
  getSignedUrl(signer, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn: 60 * 30 });

export const presignGet = (key: string, downloadName?: string) =>
  getSignedUrl(signer, new GetObjectCommand({
    Bucket, Key: key,
    ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName.replace(/"/g, '')}"` : undefined,
  }), { expiresIn: 60 * 60 });

export async function headObject(key: string) {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType };
  } catch {
    return null;
  }
}

export async function downloadTo(key: string, file: string) {
  const r = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
  await pipeline(r.Body as Readable, createWriteStream(file));
}

export async function uploadFile(key: string, file: string, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: await readFile(file), ContentType: contentType }));
}
