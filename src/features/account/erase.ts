import { deleteUserData } from "@/db/queries/users";
import { deleteByPrefix, storageEnabled, storageKeys } from "@/lib/storage";

// Everything the user stored, files first: if deleting files fails, the rows
// that point at them stay, so a retry can still find and delete them.
export async function eraseUserData(userId: string): Promise<void> {
  if (storageEnabled()) await deleteByPrefix(storageKeys.userPrefix(userId));
  await deleteUserData(userId);
}
