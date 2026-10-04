import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { Locale } from "@/i18n/routing";

type UpsertUserInput = {
  id: string;
  email: string;
  name: string | null;
  locale: Locale;
};

// First sign-in inserts with the URL locale; later sign-ins refresh email/name
// but never touch `locale`, so the saved preference wins.
export async function upsertUser(input: UpsertUserInput): Promise<string> {
  const [row] = await db
    .insert(users)
    .values(input)
    .onConflictDoUpdate({
      target: users.id,
      set: { email: input.email, name: input.name, updatedAt: sql`now()` },
    })
    .returning({ locale: users.locale });
  return row.locale;
}

export async function setUserLocale(userId: string, locale: Locale) {
  await db.update(users).set({ locale }).where(eq(users.id, userId));
}
