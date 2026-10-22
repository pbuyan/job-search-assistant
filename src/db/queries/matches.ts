import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobMatches, jobs, profiles, type FitAnalysis } from "@/db/schema";

export async function insertMatch(
  userId: string,
  match: {
    jobId: string;
    score: number;
    analysis: FitAnalysis;
    model: string;
    promptVersion: string;
    analysisLanguage: string;
  },
) {
  // The embedding similarity at analysis time (×100), kept beside the score
  // so the two can be compared later; null when either isn't embedded.
  const similarity = sql`round(100 * (1 - (
    (select ${jobs.embedding} from ${jobs} where ${jobs.id} = ${match.jobId} and ${jobs.userId} = ${userId})
    <=> (select ${profiles.embedding} from ${profiles} where ${profiles.userId} = ${userId})
  )))::int`;
  await db.insert(jobMatches).values({ ...match, userId, similarity });
}

// Every analysis run is kept (history); the page shows the most recent.
export async function getLatestMatch(userId: string, jobId: string) {
  const [row] = await db
    .select({
      score: jobMatches.score,
      analysis: jobMatches.analysis,
      analysisLanguage: jobMatches.analysisLanguage,
      createdAt: jobMatches.createdAt,
    })
    .from(jobMatches)
    .where(and(eq(jobMatches.jobId, jobId), eq(jobMatches.userId, userId)))
    .orderBy(desc(jobMatches.createdAt))
    .limit(1);
  return row ?? null;
}

// Latest score per job, most recently analyzed first.
export async function listRecentMatches(userId: string, limit = 5) {
  const latest = db
    .selectDistinctOn([jobMatches.jobId], {
      jobId: jobMatches.jobId,
      score: jobMatches.score,
      createdAt: jobMatches.createdAt,
    })
    .from(jobMatches)
    .where(eq(jobMatches.userId, userId))
    .orderBy(jobMatches.jobId, desc(jobMatches.createdAt))
    .as("latest");

  return db
    .select({
      jobId: latest.jobId,
      score: latest.score,
      createdAt: latest.createdAt,
      title: jobs.title,
      company: jobs.company,
    })
    .from(latest)
    .innerJoin(jobs, and(eq(jobs.id, latest.jobId), eq(jobs.userId, userId)))
    .orderBy(desc(latest.createdAt))
    .limit(limit);
}
