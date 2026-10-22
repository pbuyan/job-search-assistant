import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, contacts } from "@/db/schema";
import type { ContactInput } from "@/features/tracker/schemas";

// Contacts for one application (recruiter, hiring manager, referrer…).
export async function listContacts(userId: string, applicationId: string) {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      role: contacts.role,
      email: contacts.email,
      linkedinUrl: contacts.linkedinUrl,
      notes: contacts.notes,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.applicationId, applicationId),
        eq(contacts.userId, userId),
      ),
    )
    .orderBy(asc(contacts.createdAt));
}

// False when the application isn't the user's.
export async function addContact(
  userId: string,
  applicationId: string,
  contact: ContactInput,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [app] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.userId, userId),
        ),
      );
    if (!app) return false;
    await tx.insert(contacts).values({ ...contact, userId, applicationId });
    return true;
  });
}

export async function deleteContact(
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .returning({ id: contacts.id });
  return rows.length > 0;
}
