import { put } from "@vercel/blob";

// File storage for generated deliverables. Uses Vercel Blob when configured
// (BLOB_READ_WRITE_TOKEN is injected automatically once you create a Blob store
// in the Vercel dashboard). Until then, callers fall back to storing bytes
// inline in the database so the feature works end-to-end immediately.
export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function uploadFile(
  pathname: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  if (!blobConfigured()) return null;
  const { url } = await put(pathname, Buffer.from(bytes), {
    access: "public",
    contentType,
  });
  return url;
}

export function uploadPdf(
  pathname: string,
  bytes: Uint8Array,
): Promise<string | null> {
  return uploadFile(pathname, bytes, "application/pdf");
}
