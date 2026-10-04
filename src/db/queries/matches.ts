import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobMatches, type FitAnalysis } from "@/db/schema";

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
  await db.insert(jobMatches).values({ ...match, userId });
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
