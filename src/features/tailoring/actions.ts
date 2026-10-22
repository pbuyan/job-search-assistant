"use server";

import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getJob } from "@/db/queries/jobs";
import { getLatestMatch } from "@/db/queries/matches";
import { getProfile } from "@/db/queries/profile";
import {
  deleteResumeVersion as deleteResumeVersionRow,
  duplicateResumeVersion as duplicateResumeVersionRow,
  getResumeVersion,
  insertResumeVersion,
  renameResumeVersion as renameResumeVersionRow,
  updateResumeVersionData,
} from "@/db/queries/resume-versions";
import { MODEL_IDS } from "@/lib/ai/models";
import {
  PROMPT_VERSION,
  tailorPlanSchema,
  type TailorPlan,
} from "@/prompts/tailor-resume";
import { assembleResume } from "./assemble";
import { tailorResume } from "./tailor";
import { validateTailoringStructure } from "./validate-tailoring";

export type ProposeTailoringError =
  | "unauthorized"
  | "notFound"
  | "noProfile"
  | "noRequirements"
  | "parseFailed"
  | "invalidTailoring";

// Returns a proposal only; nothing is stored until the user saves it.
export async function proposeTailoring(
  jobId: unknown,
): Promise<
  { ok: true; plan: TailorPlan } | { ok: false; error: ProposeTailoringError }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const id = z.uuid().safeParse(jobId);
  if (!id.success) return { ok: false, error: "notFound" };

  const [job, profile, match] = await Promise.all([
    getJob(userId, id.data),
    getProfile(userId),
    getLatestMatch(userId, id.data),
  ]);
  if (!job) return { ok: false, error: "notFound" };
  if (!job.requirements) return { ok: false, error: "noRequirements" };
  if (!profile) return { ok: false, error: "noProfile" };

  const result = await tailorResume({
    job: { title: job.title, company: job.company },
    requirements: job.requirements,
    fit: match?.analysis ?? null,
    profile: profile.data,
    resumeLanguage: profile.language,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error === "noProfileBullets" ? "noProfile" : result.error,
    };
  }
  return { ok: true, plan: result.plan };
}

const saveInput = z.object({
  jobId: z.uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  plan: tailorPlanSchema,
});

export type SaveResumeVersionError =
  | "unauthorized"
  | "invalid"
  | "notFound"
  | "noProfile"
  | "invalidSource"
  | "failed";

// The plan may carry the user's own edits to bullet text, but every bullet
// must still cite a bullet of the *current* master profile; anything else is
// rejected. The resume itself is rebuilt here from the profile, so a client
// can't supply employers, titles or dates.
export async function saveResumeVersion(
  input: unknown,
): Promise<
  { ok: true; id: string } | { ok: false; error: SaveResumeVersionError }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { jobId, name, plan } = parsed.data;

  const [profile, job] = await Promise.all([
    getProfile(userId),
    jobId ? getJob(userId, jobId) : null,
  ]);
  if (!profile) return { ok: false, error: "noProfile" };
  if (jobId && !job) return { ok: false, error: "notFound" };
  if (validateTailoringStructure(plan, profile.data).length > 0)
    return { ok: false, error: "invalidSource" };

  try {
    const id = await insertResumeVersion(userId, {
      jobId,
      name,
      data: assembleResume(plan, profile.data),
      isAiGenerated: true,
      model: MODEL_IDS.tailorResume,
      promptVersion: PROMPT_VERSION,
      language: profile.language,
    });
    return { ok: true, id };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export type ResumeVersionError =
  "unauthorized" | "invalid" | "notFound" | "failed";
type Result = { ok: true } | { ok: false; error: ResumeVersionError };

const renameInput = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
});

export async function renameResumeVersion(input: unknown): Promise<Result> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = renameInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const renamed = await renameResumeVersionRow(
      userId,
      parsed.data.id,
      parsed.data.name,
    );
    return renamed ? { ok: true } : { ok: false, error: "notFound" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export async function deleteResumeVersion(id: unknown): Promise<Result> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };
  try {
    const deleted = await deleteResumeVersionRow(userId, parsed.data);
    return deleted ? { ok: true } : { ok: false, error: "notFound" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

const editInput = z.object({ id: z.uuid(), plan: tailorPlanSchema });

export type SaveResumeEditsError =
  | "unauthorized"
  | "invalid"
  | "notFound"
  | "noProfile"
  | "invalidSource"
  | "locked"
  | "failed";

// The user's own edits to a saved version. Same rule as saving a proposal:
// every bullet must cite the current master profile, and the resume is
// rebuilt from it here. A version attached to an application is locked.
export async function saveResumeEdits(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: SaveResumeEditsError }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = editInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { id, plan } = parsed.data;

  const profile = await getProfile(userId);
  if (!profile) return { ok: false, error: "noProfile" };
  if (validateTailoringStructure(plan, profile.data).length > 0)
    return { ok: false, error: "invalidSource" };

  try {
    const result = await updateResumeVersionData(
      userId,
      id,
      assembleResume(plan, profile.data),
    );
    return result === "ok" ? { ok: true } : { ok: false, error: result };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export async function duplicateResumeVersion(
  id: unknown,
): Promise<
  { ok: true; id: string } | { ok: false; error: ResumeVersionError }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };
  try {
    const [source, t] = await Promise.all([
      getResumeVersion(userId, parsed.data),
      getTranslations("Resumes.detail"),
    ]);
    if (!source) return { ok: false, error: "notFound" };
    const name = t("copyName", { name: source.name }).slice(0, 120);
    const copy = await duplicateResumeVersionRow(userId, parsed.data, name);
    return copy ? { ok: true, id: copy } : { ok: false, error: "notFound" };
  } catch {
    return { ok: false, error: "failed" };
  }
}
