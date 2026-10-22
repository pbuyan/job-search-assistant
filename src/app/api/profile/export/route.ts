import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/db/queries/profile";
import { documentFromProfile } from "@/features/export/document";
import {
  exportError,
  exportFormatSchema,
  exportLabels,
  exportResponse,
} from "@/features/export/respond";

export const runtime = "nodejs";

// GET /api/profile/export?format=pdf|docx — the master profile as a file.
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return exportError("unauthorized");
  const format = exportFormatSchema.safeParse(
    new URL(req.url).searchParams.get("format"),
  );
  if (!format.success) return exportError("invalid");

  const profile = await getProfile(userId);
  if (!profile) return exportError("notFound");

  const labels = await exportLabels(profile.language);
  return exportResponse({
    doc: documentFromProfile(profile.data, profile.language, labels),
    labels,
    lang: profile.language,
    title: profile.data.basics.name || "resume",
    format: format.data,
  });
}
