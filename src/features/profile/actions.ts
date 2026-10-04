"use server";

import { auth } from "@clerk/nextjs/server";
import { saveProfile as saveProfileRow } from "@/db/queries/profile";
import { setUserLocale } from "@/db/queries/users";
import type { ProfileDataInput } from "@/prompts/schemas";
import { normalizeProfile } from "./normalize";
import { localeSchema, profileSaveSchema, profileShapeSchema } from "./schemas";

// Persists the UI language for the signed-in user. Signed-out visitors
// (landing page) just switch the URL locale, so this is a no-op for them.
export async function updateLocale(input: unknown) {
  const locale = localeSchema.parse(input);
  const { userId } = await auth();
  if (!userId) return;
  await setUserLocale(userId, locale);
}

export type SaveProfileResult =
  | { ok: true; data: ProfileDataInput; language: string }
  | { ok: false; error: "unauthorized" | "invalid" | "failed" };

// This is the user's own edit of the master profile; no AI step calls it.
// Error results carry codes only, never profile content (privacy).
export async function saveProfile(input: unknown): Promise<SaveProfileResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };

  // Shape first, then normalize (mints ids for any bullet/job without one),
  // then the stricter form rules.
  const shape = profileShapeSchema.safeParse(input);
  if (!shape.success) return { ok: false, error: "invalid" };
  const parsed = profileSaveSchema.safeParse({
    language: shape.data.language,
    data: normalizeProfile(shape.data.data),
  });
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    const saved = await saveProfileRow(userId, parsed.data);
    return { ok: true, ...saved };
  } catch {
    return { ok: false, error: "failed" };
  }
}
