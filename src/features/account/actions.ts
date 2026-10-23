"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { eraseUserData } from "./erase";

export type DeleteAccountError = "unauthorized" | "notConfirmed" | "failed";

const deleteInput = z.object({ confirm: z.string().max(100) });

// Deletes all of the user's files and data, then their Clerk account. Data goes first so
// a Clerk failure never leaves resume content behind; the Clerk `user.deleted`
// webhook deletes the data again (a no-op) if the account is removed elsewhere.
// The confirmation word is checked here too, in the UI language.
export async function deleteAccount(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: DeleteAccountError }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = deleteInput.safeParse(input);
  const t = await getTranslations("Settings.delete");
  if (
    !parsed.success ||
    parsed.data.confirm.trim().toLocaleUpperCase() !==
      t("confirmWord").toLocaleUpperCase()
  )
    return { ok: false, error: "notConfirmed" };

  try {
    await eraseUserData(userId);
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
    return { ok: true };
  } catch {
    return { ok: false, error: "failed" };
  }
}
