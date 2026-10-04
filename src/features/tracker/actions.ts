"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  moveApplication as moveApplicationRow,
  trackJob as trackJobRow,
} from "@/db/queries/applications";
import { APPLICATION_STATUSES } from "./board";

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
