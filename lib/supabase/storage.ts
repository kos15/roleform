import "server-only";
import { supabaseAdmin } from "./admin";

/**
 * Bucket helpers. Layout (specs §6.3):
 *   resume/{clerk_user_id}/{document_id}.{ext}
 *   exports/{clerk_user_id}/{analysis_id}/{draft_id}-{template}.{pdf|docx}
 *   exports/{clerk_user_id}/{analysis_id}/all.zip
 *
 * Both buckets are private. Reads are signed, expiring URLs — storage RLS
 * (policies.sql) enforces the path prefix independently of these helpers.
 */

export const BUCKET_RESUMES = "resume";
export const BUCKET_EXPORTS = "exports";

const SIGNED_URL_TTL_SECONDS = 60 * 10;

export function resumePath(clerkUserId: string, documentId: string, ext: string): string {
  return `${clerkUserId}/${documentId}.${ext.replace(/^\./, "")}`;
}

export function exportPath(
  clerkUserId: string,
  analysisId: string,
  filename: string,
): string {
  return `${clerkUserId}/${analysisId}/${filename}`;
}

export async function uploadObject(
  bucket: string,
  path: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<{ path: string; bytes: number }> {
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  return { path, bytes: body.byteLength };
}

export async function downloadObject(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`storage download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function removePrefix(bucket: string, prefix: string): Promise<number> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`storage list failed: ${error.message}`);
  const paths: string[] = [];
  for (const entry of data ?? []) {
    if (entry.id === null) {
      // a folder — recurse one level (analysis subfolders under exports/)
      const { data: inner } = await supabaseAdmin.storage
        .from(bucket)
        .list(`${prefix}/${entry.name}`, { limit: 1000 });
      for (const f of inner ?? []) paths.push(`${prefix}/${entry.name}/${f.name}`);
    } else {
      paths.push(`${prefix}/${entry.name}`);
    }
  }
  if (paths.length === 0) return 0;
  const { error: delError } = await supabaseAdmin.storage.from(bucket).remove(paths);
  if (delError) throw new Error(`storage remove failed: ${delError.message}`);
  return paths.length;
}

/**
 * Signed URL for a private object.
 *
 * For `exports` we rewrite the host to files.koustubh.org: CloudFront fronts the
 * bucket for distribution and TTLs only — the signature stays the authorisation
 * mechanism, and the bucket stays private (CLAUDE.md §6).
 */
export async function signedUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new Error(`signed url failed: ${error?.message}`);

  const base = process.env.NEXT_PUBLIC_FILES_BASE_URL;
  if (bucket === BUCKET_EXPORTS && base) {
    const signed = new URL(data.signedUrl);
    return `${base.replace(/\/$/, "")}${signed.pathname}${signed.search}`;
  }
  return data.signedUrl;
}
