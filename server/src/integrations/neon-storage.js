import { AwsClient } from 'aws4fetch';
import { env } from '../config/env.js';

/**
 * Neon Object Storage.
 *
 * It exposes an S3-style API, so requests are signed with SigV4. `aws4fetch` is a
 * ~5 KB signer that works on Workers and Node without the AWS SDK.
 *
 * Background: https://neon.com/docs/storage/overview
 * The bucket must be created with the `public_read` access level so posters can be
 * served straight from the branch endpoint (reads on a private bucket need a
 * presigned URL).
 */

let client = null;

export function isNeonStorageEnabled() {
  return Boolean(
    env.NEON_STORAGE_ENDPOINT &&
      env.NEON_STORAGE_BUCKET &&
      env.NEON_STORAGE_ACCESS_KEY_ID &&
      env.NEON_STORAGE_SECRET_ACCESS_KEY
  );
}

function s3() {
  if (!client) {
    client = new AwsClient({
      accessKeyId: env.NEON_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.NEON_STORAGE_SECRET_ACCESS_KEY,
      service: 's3',
      region: env.NEON_STORAGE_REGION || 'us-east-2',
    });
  }
  return client;
}

/** Path-style URL, which is what Neon requires (`force_path_style: true`). */
function objectUrl(key) {
  const base = String(env.NEON_STORAGE_ENDPOINT || '').replace(/\/+$/, '');
  const bucket = env.NEON_STORAGE_BUCKET;
  const clean = String(key).replace(/^\/+/, '');
  return `${base}/${bucket}/${clean}`;
}

/** Public URL for an object in a `public_read` bucket. */
export function publicObjectUrl(key) {
  if (env.NEON_STORAGE_PUBLIC_URL) {
    return `${String(env.NEON_STORAGE_PUBLIC_URL).replace(/\/+$/, '')}/${String(key).replace(/^\/+/, '')}`;
  }
  return objectUrl(key);
}

export async function uploadObject(key, body, contentType, cacheControl = 'public, max-age=31536000') {
  const response = await s3().fetch(objectUrl(key), {
    method: 'PUT',
    body,
    headers: {
      'content-type': contentType,
      'cache-control': cacheControl,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(
      `Neon object storage upload failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`
    );
    error.status = 502;
    throw error;
  }

  return publicObjectUrl(key);
}

export async function deleteObject(key) {
  const response = await s3().fetch(objectUrl(key), { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    const error = new Error(`Neon object storage delete failed (${response.status})`);
    error.status = 502;
    throw error;
  }
}
