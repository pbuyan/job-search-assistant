import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, resumeVersions, type TailoredResume } from "@/db/schema";

export async function insertResumeVersion(
  userId: string,
  version: {
    jobId: string | null;
    name: string;
    data: TailoredResume;
    isAiGenerated: boolean;
    model: string | null;
    promptVersion: string | null;
    language: string;
  },
): Promise<string> {
  const [row] = await db
    .insert(resumeVersions)
    .values({ ...version, userId })
    .returning({ id: resumeVersions.id });
  return row.id;
}

// The job join is scoped to the user too, so a stale jobId never leaks
// another user's job.
const versionColumns = {
  id: resumeVersions.id,
  name: resumeVersions.name,
  jobId: resumeVersions.jobId,
  language: resumeVersions.language,
  isAiGenerated: resumeVersions.isAiGenerated,
  createdAt: resumeVersions.createdAt,
  updatedAt: resumeVersions.updatedAt,
  jobTitle: jobs.title,
  jobCompany: jobs.company,
};

export async function getResumeVersion(userId: string, id: string) {
  const [row] = await db
    .select({ ...versionColumns, data: resumeVersions.data })
    .from(resumeVersions)
    .leftJoin(
      jobs,
      and(eq(jobs.id, resumeVersions.jobId), eq(jobs.userId, userId)),
    )
    .where(and(eq(resumeVersions.id, id), eq(resumeVersions.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listResumeVersions(
  userId: string,
  filter: { jobId?: string } = {},
) {
  return db
    .select(versionColumns)
    .from(resumeVersions)
    .leftJoin(
      jobs,
      and(eq(jobs.id, resumeVersions.jobId), eq(jobs.userId, userId)),
    )
    .where(
      and(
        eq(resumeVersions.userId, userId),
        filter.jobId ? eq(resumeVersions.jobId, filter.jobId) : undefined,
      ),
    )
    .orderBy(desc(resumeVersions.createdAt));
}

// False when the version isn't the user's.
export async function renameResumeVersion(
  userId: string,
  id: string,
  name: string,
): Promise<boolean> {
  const rows = await db
    .update(resumeVersions)
    .set({ name })
    .where(and(eq(resumeVersions.id, id), eq(resumeVersions.userId, userId)))
    .returning({ id: resumeVersions.id });
  return rows.length > 0;
}

export async function deleteResumeVersion(
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(resumeVersions)
    .where(and(eq(resumeVersions.id, id), eq(resumeVersions.userId, userId)))
    .returning({ id: resumeVersions.id });
  return rows.length > 0;
}
