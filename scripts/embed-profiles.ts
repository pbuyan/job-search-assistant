// pnpm embed:profiles — embeds every profile that has no embedding yet
// (profiles saved before job matching existed, or whose last embedding
// failed). One at a time, to stay within the embedding API's rate limits.
// Prints counts only: profile text is PII.
import { config } from "dotenv";

// Must run before src/lib/ai/embeddings.ts reads the env.
config({ path: ".env.local", quiet: true });

async function main() {
  const { isNull } = await import("drizzle-orm");
  const { db } = await import("@/db");
  const { profiles } = await import("@/db/schema");
  const { embedProfile } = await import("@/features/matching/embed-profile");

  const pending = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(isNull(profiles.embedding));
  const counts: Record<string, number> = {};
  for (const { userId } of pending) {
    const result = await embedProfile(userId);
    counts[result] = (counts[result] ?? 0) + 1;
  }
  console.log(`${pending.length} profile(s) without an embedding:`, counts);
  process.exit(counts.failed || counts.rateLimited ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(`embed-profiles crashed (${error instanceof Error ? error.name : typeof error}).`);
  process.exit(2);
});
