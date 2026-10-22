import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { applications, contacts, jobs } from "@/db/schema";

export type NewJob = Omit<
  typeof jobs.$inferInsert,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

// Board imports carry an externalId, so re-importing the same posting updates
// the existing row (keeping its id, matches and tracker card) instead of
// duplicating it. Rows without an externalId never conflict: NULLs are
// distinct in the unique index.
export async function upsertJob(userId: string, job: NewJob): Promise<string> {
  const [row] = await db
    .insert(jobs)
    .values({ ...job, userId })
    .onConflictDoUpdate({
      target: [jobs.userId, jobs.source, jobs.externalId],
      set: { ...job, updatedAt: new Date() },
    })
    .returning({ id: jobs.id });
  return row.id;
}

const jobColumns = {
  id: jobs.id,
  source: jobs.source,
  url: jobs.url,
  company: jobs.company,
  title: jobs.title,
  location: jobs.location,
  remote: jobs.remote,
  salaryMin: jobs.salaryMin,
  salaryMax: jobs.salaryMax,
  salaryCurrency: jobs.salaryCurrency,
  requirements: jobs.requirements,
  language: jobs.language,
  createdAt: jobs.createdAt,
};

export async function getJob(userId: string, jobId: string) {
  const [row] = await db
    .select(jobColumns)
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1);
  return row ?? null;
}

export type JobRow = NonNullable<Awaited<ReturnType<typeof getJob>>>;

export async function listJobs(userId: string) {
  return db
    .select({
      id: jobs.id,
      company: jobs.company,
      title: jobs.title,
      location: jobs.location,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(eq(jobs.userId, userId))
    .orderBy(desc(jobs.createdAt));
}

// Deletes the job with its fit analyses, application and timeline (all
// cascade) and the application's contacts. Tailored resume versions are kept,
// detached from the job. False when the job isn't the user's.
export async function deleteJob(userId: string, jobId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const apps = tx
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.jobId, jobId), eq(applications.userId, userId)));
    await tx
      .delete(contacts)
      .where(and(eq(contacts.userId, userId), inArray(contacts.applicationId, apps)));
    const rows = await tx
      .delete(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
      .returning({ id: jobs.id });
    return rows.length > 0;
  });
}
