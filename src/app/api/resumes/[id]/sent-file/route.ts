import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getResumeVersion } from "@/db/queries/resume-versions";
import { contentDisposition } from "@/features/export/document";
import { exportError } from "@/features/export/respond";
import { readPrivate } from "@/lib/storage";

export const runtime = "nodejs";

// GET /api/resumes/:id/sent-file — the PDF kept when the version was attached
// to an application, streamed to its owner. There is no public URL.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return exportError("unauthorized");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return exportError("invalid");

  const version = await getResumeVersion(userId, id.data);
  const key = version?.exportedFileKey;
  const file = key ? await readPrivate(key).catch(() => null) : null;
  if (!version || !file) return exportError("notFound");

  return new Response(file.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(version.name, "pdf"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
