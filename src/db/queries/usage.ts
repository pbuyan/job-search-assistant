import { sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { type AiFeature, dailyLimit, usageDay } from "@/lib/ai/quotas";

// Counts one call against today's cap, or refuses it. One statement, so
// concurrent calls can't both take the last slot: the update only runs while
// the count is under the cap, and returns no row when it isn't.
export async function consumeQuota(
  userId: string,
  feature: AiFeature,
): Promise<"ok" | "exceeded"> {
  const limit = dailyLimit(feature);
  const rows = await db
    .insert(aiUsage)
    .values({ userId, feature, day: usageDay(), count: 1 })
    .onConflictDoUpdate({
      target: [aiUsage.userId, aiUsage.feature, aiUsage.day],
      set: { count: sql`${aiUsage.count} + 1` },
      setWhere: sql`${aiUsage.count} < ${limit}`,
    })
    .returning({ count: aiUsage.count });
  return rows.length > 0 ? "ok" : "exceeded";
}
