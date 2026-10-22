import { and, desc, eq, exists, ilike, inArray, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { applications, contacts, jobMatches, jobs, profiles } from "@/db/schema";
import type { JobListParams } from "@/features/matching/schemas";

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

// Cosine similarity between a job and the user's profile (1 = same
// direction), null when either has no embedding. Both are embedded with the
// same model (src/lib/ai/embeddings.ts).
//
// Subqueries here are query builders, not hand-written SQL: in a select
// field, Drizzle writes columns without their table, so a hand-written
// `job_id = ${jobs.id}` would compare against the subquery's own "id".
// Builders keep the table names.
const similarityTo = (userId: string) => {
  const profileEmbedding = db
    .select({ embedding: profiles.embedding })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  return sql<number | null>`1 - (${jobs.embedding} <=> (${profileEmbedding}))`;
};

// The latest fit score for the job.
const latestScore = (userId: string) => {
  const latest = db
    .select({ score: jobMatches.score })
    .from(jobMatches)
    .where(and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
    .orderBy(desc(jobMatches.createdAt))
    .limit(1);
  return sql<number | null>`(${latest})`;
};

const analyses = (userId: string) =>
  db
    .select({ one: sql`1` })
    .from(jobMatches)
    .where(and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)));

// LIKE treats % and _ as wildcards; a typed location is matched literally.
const escapeLike = (v: string) => v.replace(/[\\%_]/g, "\\$&");

// The user's jobs with their latest fit score and similarity to the profile,
// filtered and sorted per the jobs list's URL parameters. `minSalary` (from
// the user's preferences) is only used with params.salary: it hides jobs
// whose posted maximum, in the same currency, is below it; jobs without a
// posted salary stay.
export async function listJobs(
  userId: string,
  params: Partial<JobListParams> = {},
  minSalary?: { amount: number; currency: string } | null,
) {
  const similarity = similarityTo(userId);
  const score = latestScore(userId);
  const order =
    params.sort === "match"
      ? [sql`${similarity} desc nulls last`, desc(jobs.createdAt)]
      : params.sort === "fit"
        ? [sql`${score} desc nulls last`, desc(jobs.createdAt)]
        : [desc(jobs.createdAt)];

  return db
    .select({
      id: jobs.id,
      company: jobs.company,
      title: jobs.title,
      location: jobs.location,
      remote: jobs.remote,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      salaryCurrency: jobs.salaryCurrency,
      createdAt: jobs.createdAt,
      similarity,
      score,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.userId, userId),
        params.remote ? eq(jobs.remote, params.remote) : undefined,
        params.location
          ? ilike(jobs.location, `%${escapeLike(params.location)}%`)
          : undefined,
        params.analyzed === "yes" ? exists(analyses(userId)) : undefined,
        params.analyzed === "no" ? notExists(analyses(userId)) : undefined,
        params.salary === "min" && minSalary
          ? sql`not (${jobs.salaryMax} is not null and ${jobs.salaryCurrency} = ${minSalary.currency} and ${jobs.salaryMax} < ${minSalary.amount})`
          : undefined,
      ),
    )
    .orderBy(...order);
}

export type JobListRow = Awaited<ReturnType<typeof listJobs>>[number];

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
