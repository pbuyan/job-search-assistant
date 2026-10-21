import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";

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
