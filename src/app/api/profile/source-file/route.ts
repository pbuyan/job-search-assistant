import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSourceFileKey, setSourceFileKey } from "@/db/queries/profile";
import { sniff } from "@/features/profile/extract-text";
import { MAX_FILE_BYTES } from "@/features/profile/upload-limits";
import {
  deletePrivate,
  putPrivate,
  readPrivate,
  storageEnabled,
  storageKeys,
} from "@/lib/storage";

export const runtime = "nodejs";

type ErrorCode =
  | "unauthorized"
  | "unavailable"
  | "invalidFile"
  | "tooLarge"
  | "unsupportedType"
  | "noProfile"
  | "notFound"
  | "failed";

const fail = (error: ErrorCode, status: number) =>
  NextResponse.json({ ok: false, error }, { status });

const CONTENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

const uploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0 && f.size <= MAX_FILE_BYTES),
});

// POST: keeps the resume file a saved profile was imported from. The form
// calls it only after the user accepted the import and saved, so nothing is
// stored before then. The format comes from the bytes; the file name is
// never stored (PII). Nothing here logs file content or names.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return fail("unauthorized", 401);
  if (!storageEnabled()) return fail("unavailable", 503);

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES + 64 * 1024) {
    return fail("tooLarge", 413);
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("invalidFile", 400);
  }
  const upload = uploadSchema.safeParse({ file: form.get("file") });
  if (!upload.success) return fail("invalidFile", 400);

  const bytes = new Uint8Array(await upload.data.file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return fail("unsupportedType", 415);

  const key = storageKeys.profileSource(userId, kind);
  try {
    const previous = await getSourceFileKey(userId);
    await putPrivate(key, bytes, CONTENT_TYPES[kind]);
    if (!(await setSourceFileKey(userId, key))) {
      await deletePrivate(key);
      return fail("noProfile", 404);
    }
    // A PDF replacing a Word file (or the reverse) lives under another key.
    if (previous && previous !== key) await deletePrivate(previous);
    return NextResponse.json({ ok: true });
  } catch {
    return fail("failed", 500);
  }
}

// GET: the kept file, streamed to its owner. There is no public URL.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return fail("unauthorized", 401);
  const key = await getSourceFileKey(userId);
  const file = key ? await readPrivate(key).catch(() => null) : null;
  if (!key || !file) return fail("notFound", 404);
  const ext = key.endsWith(".docx") ? "docx" : "pdf";
  return new Response(file.stream, {
    headers: {
      "Content-Type": CONTENT_TYPES[ext],
      "Content-Disposition": `attachment; filename="resume.${ext}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
