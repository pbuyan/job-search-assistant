"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  addEvent,
  deleteApplication,
  deleteEvent,
  moveApplication as moveApplicationRow,
  trackJob as trackJobRow,
  updateApplication,
} from "@/db/queries/applications";
import { addContact, deleteContact } from "@/db/queries/contacts";
import { snapshotSentResume } from "@/features/export/snapshot";
import { APPLICATION_STATUSES } from "./board";
import { applicationDetailsSchema, contactSchema, eventSchema } from "./schemas";

export type TrackerError = "unauthorized" | "notFound" | "failed";
type Result = { ok: true } | { ok: false; error: TrackerError };

export async function trackJob(jobId: unknown): Promise<Result> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const id = z.uuid().safeParse(jobId);
  if (!id.success) return { ok: false, error: "notFound" };
  try {
    const applicationId = await trackJobRow(userId, id.data);
    return applicationId ? { ok: true } : { ok: false, error: "notFound" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

const moveInput = z.object({
  applicationId: z.uuid(),
  status: z.enum(APPLICATION_STATUSES),
  index: z.number().int().min(0).max(10_000),
});

export async function moveApplication(input: unknown): Promise<Result> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = moveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  try {
    const moved = await moveApplicationRow(userId, parsed.data);
    return moved ? { ok: true } : { ok: false, error: "notFound" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

// The application page's actions.
export type ApplicationError =
  | "unauthorized"
  | "invalid"
  | "invalidResume"
  | "notFound"
  | "failed";
type ApplicationResult = { ok: true } | { ok: false; error: ApplicationError };

// Signed-in user, Zod-validated input, then a query that only touches that
// user's rows (false or "notFound" when the row isn't theirs). Errors are
// codes; nothing is logged.
async function run<S extends z.ZodType>(
  input: unknown,
  schema: S,
  fn: (
    userId: string,
    data: z.infer<S>,
  ) => Promise<boolean | "ok" | "notFound" | "invalidResume">,
): Promise<ApplicationResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const result = await fn(userId, parsed.data);
    if (result === true || result === "ok") return { ok: true };
    return { ok: false, error: result === false ? "notFound" : result };
  } catch {
    return { ok: false, error: "failed" };
  }
}

const detailsInput = applicationDetailsSchema.extend({ id: z.uuid() });
export async function saveApplicationDetails(input: unknown) {
  return run(input, detailsInput, async (userId, { id, ...details }) => {
    const result = await updateApplication(userId, id, details);
    // The attached version is now locked: keep the PDF that was sent.
    if (result === "ok" && details.resumeVersionId)
      await snapshotSentResume(userId, details.resumeVersionId);
    return result;
  });
}

const eventInput = eventSchema.extend({ applicationId: z.uuid() });
export async function addApplicationEvent(input: unknown) {
  return run(input, eventInput, (userId, { applicationId, ...event }) =>
    addEvent(userId, applicationId, event),
  );
}

export async function deleteApplicationEvent(id: unknown) {
  return run(id, z.uuid(), (userId, eventId) => deleteEvent(userId, eventId));
}

const contactInput = contactSchema.extend({ applicationId: z.uuid() });
export async function addApplicationContact(input: unknown) {
  return run(input, contactInput, (userId, { applicationId, ...contact }) =>
    addContact(userId, applicationId, contact),
  );
}

export async function deleteApplicationContact(id: unknown) {
  return run(id, z.uuid(), (userId, contactId) => deleteContact(userId, contactId));
}

// The application, its timeline and contacts go; the job stays.
export async function stopTracking(id: unknown) {
  return run(id, z.uuid(), (userId, applicationId) =>
    deleteApplication(userId, applicationId),
  );
}
