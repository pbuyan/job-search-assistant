"use server";

import { auth } from "@clerk/nextjs/server";
import { savePreferences as savePreferencesRow } from "@/db/queries/profile";
import { embedProfile } from "./embed-profile";
import { preferencesSchema } from "./schemas";

export type MatchingError =
  "unauthorized" | "invalid" | "noProfile" | "rateLimited" | "failed";

// Saves search preferences, then re-embeds the profile (target titles are
// part of it). `matched: false` means preferences are saved but matching
// isn't up to date yet.
export async function savePreferences(
  input: unknown,
): Promise<
  { ok: true; matched: boolean } | { ok: false; error: MatchingError }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    if (!(await savePreferencesRow(userId, parsed.data)))
      return { ok: false, error: "noProfile" };
  } catch {
    return { ok: false, error: "failed" };
  }
  const matched = (await embedProfile(userId).catch(() => "failed")) === "ok";
  return { ok: true, matched };
}

// The profile page's "Retry" when matching isn't up to date.
export async function retryProfileMatching(): Promise<
  { ok: true } | { ok: false; error: MatchingError }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const result = await embedProfile(userId).catch(() => "failed" as const);
  if (result === "ok" || result === "superseded") return { ok: true };
  return { ok: false, error: result };
}
