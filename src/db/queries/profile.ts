import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, type ProfileData } from "@/db/schema";

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

// Writes only the user-edited columns; search preferences, embedding and
// source file are left untouched. One profile per user (user_id is unique).
export async function saveProfile(
  userId: string,
  input: StoredProfile,
): Promise<StoredProfile> {
  const [row] = await db
    .insert(profiles)
    .values({ userId, data: input.data, language: input.language })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { data: input.data, language: input.language },
    })
    .returning({ data: profiles.data, language: profiles.language });
  return row;
}
