import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { extractResumeText, MAX_FILE_BYTES } from "@/features/profile/extract-text";
import { parseResume } from "@/features/profile/parse-resume";

export const runtime = "nodejs";
export const maxDuration = 120;

const uploadSchema = z.object({
  file: z.instanceof(File).refine((f) => f.size > 0 && f.size <= MAX_FILE_BYTES),
});

type ErrorCode =
  | "unauthorized"
  | "invalidFile"
  | "tooLarge"
  | "unsupportedType"
  | "unreadable"
  | "noText"
  | "tooLong"
  | "noContent"
  | "parseFailed";

const fail = (error: ErrorCode, status: number) =>
  NextResponse.json({ ok: false, error }, { status });

// Parses an uploaded resume and returns a *proposal*. Nothing is stored — the
// file is processed in memory and the user saves (or discards) from the form.
// Nothing here may log resume text, file names or parser/model errors.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return fail("unauthorized", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("invalidFile", 400);
  }
  const upload = uploadSchema.safeParse({ file: form.get("file") });
  if (!upload.success) {
    const file = form.get("file");
    const tooBig = file instanceof File && file.size > MAX_FILE_BYTES;
    return tooBig ? fail("tooLarge", 413) : fail("invalidFile", 400);
  }

  const { file } = upload.data;
  const extracted = await extractResumeText(new Uint8Array(await file.arrayBuffer()), file.name);
  if (!extracted.ok) {
    return fail(extracted.error, extracted.error === "tooLarge" ? 413 : 422);
  }

  const parsed = await parseResume(extracted.text);
  if (!parsed.ok) return fail(parsed.error, parsed.error === "noContent" ? 422 : 502);

  return NextResponse.json(parsed);
}
