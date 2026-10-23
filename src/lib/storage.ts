import { del, get, list, put } from "@vercel/blob";

// Private Vercel Blob storage (BLOB_READ_WRITE_TOKEN). Blobs are private:
// they have no public URL and are only read here, server-side, by a route
// that has checked the signed-in user owns the record pointing at them.
//
// Keys are built only by the helpers below: they hold the user id and record
// ids, never file names or other content (PII).
export const storageKeys = {
  userPrefix: (userId: string) => `users/${userId}/`,
  profileSource: (userId: string, kind: "pdf" | "docx") =>
    `users/${userId}/profile/source.${kind}`,
  sentResumePrefix: (userId: string, versionId: string) =>
    `users/${userId}/resumes/${versionId}/`,
  sentResume: (userId: string, versionId: string) =>
    `users/${userId}/resumes/${versionId}/sent.pdf`,
};

export async function putPrivate(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string,
): Promise<void> {
  await put(key, Buffer.from(body), {
    access: "private",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// Null when the blob doesn't exist.
export async function readPrivate(
  key: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  const result = await get(key, { access: "private", useCache: false });
  if (!result?.stream) return null;
  return {
    stream: result.stream,
    contentType: result.blob.contentType ?? "application/octet-stream",
  };
}

export async function deletePrivate(key: string): Promise<void> {
  await del(key);
}

// Deletes every blob under the prefix, page by page.
export async function deleteByPrefix(prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor });
    if (page.blobs.length > 0) await del(page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

// Storage is optional in local dev: without a token, nothing is stored and
// the app works as before (no download links).
export const storageEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;
