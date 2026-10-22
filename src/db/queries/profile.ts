import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles, type ProfileData } from "@/db/schema";
import type { Preferences } from "@/features/matching/schemas";

export type StoredProfile = { data: ProfileData; language: string };

export async function getProfile(
  userId: string,
): Promise<StoredProfile | null> {
  const [row] = await db
    .select({ data: profiles.data, language: profiles.language })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return row ?? null;
}

// Writes only the user-edited columns; search preferences and source file are
// left untouched. The embedding is cleared because it no longer describes the
// profile; the caller re-embeds (see src/features/matching/embed-profile.ts).
// One profile per user (user_id is unique).
export async function saveProfile(
  userId: string,
  input: StoredProfile,
): Promise<StoredProfile> {
  const [row] = await db
    .insert(profiles)
    .values({ userId, data: input.data, language: input.language })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { data: input.data, language: input.language, embedding: null },
    })
    .returning({ data: profiles.data, language: profiles.language });
  return row;
}

// Search preferences and whether the profile can be matched against jobs
// (has an up-to-date embedding). Null when there's no profile yet.
export async function getMatchingState(userId: string) {
  const [row] = await db
    .select({
      targetTitles: profiles.targetTitles,
      targetLocations: profiles.targetLocations,
      remotePreference: profiles.remotePreference,
      minSalary: profiles.minSalary,
      salaryCurrency: profiles.salaryCurrency,
      embedded: isNotNull(profiles.embedding),
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return row ?? null;
}

// Target titles are part of what's embedded, so the embedding is cleared
// here too. False when the user has no profile yet.
export async function savePreferences(
  userId: string,
  prefs: Preferences,
): Promise<boolean> {
  const rows = await db
    .update(profiles)
    .set({ ...prefs, embedding: null })
    .where(eq(profiles.userId, userId))
    .returning({ id: profiles.id });
  return rows.length > 0;
}

// Stores the embedding only if the profile is still the version it was
// computed from (`basedOn` is its updated_at), so a save that lands while
// embedding is in flight isn't overwritten by a stale vector. Compared at
// millisecond precision: a JS Date can't hold the microseconds now() writes.
export async function setProfileEmbedding(
  userId: string,
  embedding: number[],
  basedOn: Date,
): Promise<boolean> {
  const rows = await db
    .update(profiles)
    .set({ embedding })
    .where(
      and(
        eq(profiles.userId, userId),
        // A Date inside sql`` isn't serialized by the driver; send ISO text.
        sql`date_trunc('milliseconds', ${profiles.updatedAt}) = ${basedOn.toISOString()}::timestamptz`,
      ),
    )
    .returning({ id: profiles.id });
  return rows.length > 0;
}

// What embedding needs: the profile, its target titles and its version.
export async function getProfileForEmbedding(userId: string) {
  const [row] = await db
    .select({
      data: profiles.data,
      targetTitles: profiles.targetTitles,
      updatedAt: profiles.updatedAt,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return row ?? null;
}
