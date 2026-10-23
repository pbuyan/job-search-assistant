import { and, desc, eq, isNull, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  applications,
  jobs,
  resumeVersions,
  type TailoredResume,
} from "@/db/schema";

// A version attached to an application is what was sent, so its content is
// frozen; the user edits a copy instead.
const attachedTo = (userId: string) =>
  db
    .select({ one: sql`1` })
    .from(applications)
    .where(
      and(
        eq(applications.resumeVersionId, resumeVersions.id),
        eq(applications.userId, userId),
      ),
    );

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
    sourceVersionId?: string | null;
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

const sourceVersions = alias(resumeVersions, "source_versions");

export async function getResumeVersion(userId: string, id: string) {
  const [row] = await db
    .select({
      ...versionColumns,
      data: resumeVersions.data,
      model: resumeVersions.model,
      promptVersion: resumeVersions.promptVersion,
      exportedFileKey: resumeVersions.exportedFileKey,
      locked: sql<boolean>`exists (${attachedTo(userId)})`,
      // A translation's source, if it still exists.
      sourceVersionId: sourceVersions.id,
      sourceVersionName: sourceVersions.name,
    })
    .from(resumeVersions)
    .leftJoin(
      jobs,
      and(eq(jobs.id, resumeVersions.jobId), eq(jobs.userId, userId)),
    )
    .leftJoin(
      sourceVersions,
      and(
        eq(sourceVersions.id, resumeVersions.sourceVersionId),
        eq(sourceVersions.userId, userId),
      ),
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

// Replaces the content unless the version is locked. One statement, so a
// version attached concurrently can't be edited after the check.
export async function updateResumeVersionData(
  userId: string,
  id: string,
  data: TailoredResume,
): Promise<"ok" | "locked" | "notFound"> {
  const rows = await db
    .update(resumeVersions)
    .set({ data })
    .where(
      and(
        eq(resumeVersions.id, id),
        eq(resumeVersions.userId, userId),
        notExists(attachedTo(userId)),
      ),
    )
    .returning({ id: resumeVersions.id });
  if (rows.length > 0) return "ok";
  const [exists] = await db
    .select({ id: resumeVersions.id })
    .from(resumeVersions)
    .where(and(eq(resumeVersions.id, id), eq(resumeVersions.userId, userId)))
    .limit(1);
  return exists ? "locked" : "notFound";
}

// Records the stored copy of the file that was sent, once: the first
// snapshot of a locked version stands. False when it was already set or the
// version isn't the user's.
export async function setExportedFileKey(
  userId: string,
  id: string,
  key: string,
): Promise<boolean> {
  const rows = await db
    .update(resumeVersions)
    .set({ exportedFileKey: key, updatedAt: sql`${resumeVersions.updatedAt}` })
    .where(
      and(
        eq(resumeVersions.id, id),
        eq(resumeVersions.userId, userId),
        isNull(resumeVersions.exportedFileKey),
      ),
    )
    .returning({ id: resumeVersions.id });
  return rows.length > 0;
}

// An unlocked copy with the same content and provenance. Null when the
// version isn't the user's.
export async function duplicateResumeVersion(
  userId: string,
  id: string,
  name: string,
): Promise<string | null> {
  const [source] = await db
    .select({
      jobId: resumeVersions.jobId,
      data: resumeVersions.data,
      isAiGenerated: resumeVersions.isAiGenerated,
      model: resumeVersions.model,
      promptVersion: resumeVersions.promptVersion,
      language: resumeVersions.language,
      sourceVersionId: resumeVersions.sourceVersionId,
    })
    .from(resumeVersions)
    .where(and(eq(resumeVersions.id, id), eq(resumeVersions.userId, userId)))
    .limit(1);
  if (!source) return null;
  return insertResumeVersion(userId, { ...source, name });
}
