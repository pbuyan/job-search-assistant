import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getResumeVersion } from "@/db/queries/resume-versions";
import { documentFromResume } from "@/features/export/document";
import {
  exportError,
  exportFormatSchema,
  exportLabels,
  exportResponse,
} from "@/features/export/respond";

export const runtime = "nodejs";

// GET /api/resumes/:id/export?format=pdf|docx — a saved resume version as a
// file, rendered on demand.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return exportError("unauthorized");
  const id = z.uuid().safeParse((await params).id);
  const format = exportFormatSchema.safeParse(
    new URL(req.url).searchParams.get("format"),
  );
  if (!id.success || !format.success) return exportError("invalid");

  const version = await getResumeVersion(userId, id.data);
  if (!version) return exportError("notFound");

  const labels = await exportLabels(version.language);
  return exportResponse({
    doc: documentFromResume(version.data, version.language, labels),
    labels,
    lang: version.language,
    title: version.name,
    format: format.data,
  });
}
