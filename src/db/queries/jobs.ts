import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  notExists,
  or,
  sql,
} from "drizzle-orm";
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
  closedAt: jobs.closedAt,
  checkedAt: jobs.checkedAt,
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

// What a posting check needs: where to read it again, and the stored text to
// compare it with.
export async function getJobPosting(userId: string, jobId: string) {
  const [row] = await db
    .select({
      id: jobs.id,
      source: jobs.source,
      url: jobs.url,
      descriptionRaw: jobs.descriptionRaw,
      closedAt: jobs.closedAt,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1);
  return row ?? null;
}

// Records a posting check. A closed posting keeps the date it was first seen
// closed; an open one is (re)opened; an unreachable board changes nothing
// but the check time. updatedAt is kept: the job itself didn't change.
export async function markPostingChecked(
  userId: string,
  jobId: string,
  state: "open" | "closed" | "unavailable",
  now = new Date(),
): Promise<boolean> {
  const closedAt =
    state === "open"
      ? null
      : state === "closed"
        ? sql`coalesce(${jobs.closedAt}, ${now.toISOString()}::timestamptz)`
        : sql`${jobs.closedAt}`;
  const rows = await db
    .update(jobs)
    .set({ checkedAt: now, closedAt, updatedAt: sql`${jobs.updatedAt}` })
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

// A refreshed posting whose text changed: new text, requirements and
// embedding, and open as of this check.
export async function updateJobPosting(
  userId: string,
  jobId: string,
  job: Partial<NewJob>,
  now = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ ...job, closedAt: null, checkedAt: now, updatedAt: now })
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

// For the daily cron only, which acts for every user: open board postings not
// checked since `before`, least recently checked first. It returns each row's
// userId, and every write that follows filters by it.
export async function listJobsToCheck(before: Date, limit: number) {
  return db
    .select({
      id: jobs.id,
      userId: jobs.userId,
      source: jobs.source,
      url: jobs.url,
    })
    .from(jobs)
    .where(
      and(
        inArray(jobs.source, ["greenhouse", "lever", "ashby"]),
        isNotNull(jobs.url),
        isNull(jobs.closedAt),
        or(isNull(jobs.checkedAt), lt(jobs.checkedAt, before)),
      ),
    )
    .orderBy(sql`${jobs.checkedAt} asc nulls first`, asc(jobs.createdAt))
    .limit(limit);
}

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
      closedAt: jobs.closedAt,
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
        params.posting === "open" ? isNull(jobs.closedAt) : undefined,
        params.posting === "closed" ? isNotNull(jobs.closedAt) : undefined,
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

// Which of these board postings the user has already imported: external id →
// job id. Uses the (user, source, external id) unique index.
export async function importedJobIds(
  userId: string,
  source: "greenhouse" | "lever" | "ashby",
  externalIds: string[],
): Promise<Map<string, string>> {
  if (externalIds.length === 0) return new Map();
  const rows = await db
    .select({ id: jobs.id, externalId: jobs.externalId })
    .from(jobs)
    .where(
      and(
        eq(jobs.userId, userId),
        eq(jobs.source, source),
        inArray(jobs.externalId, externalIds),
      ),
    );
  return new Map(
    rows.flatMap((r) => (r.externalId ? [[r.externalId, r.id] as const] : [])),
  );
}
