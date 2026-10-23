"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getApplication } from "@/db/queries/applications";
import { getJob } from "@/db/queries/jobs";
import { getLatestMatch } from "@/db/queries/matches";
import { getProfile } from "@/db/queries/profile";
import { getResumeVersion } from "@/db/queries/resume-versions";
import { consumeQuota } from "@/db/queries/usage";
import { draftCoverLetter } from "./draft";

export type ProposeCoverLetterError =
  | "unauthorized"
  | "notFound"
  | "noProfile"
  | "noRequirements"
  | "parseFailed"
  | "invalidCoverLetter"
  | "quotaExceeded";

// Returns a proposal only; the user puts it in the cover letter field and
// saves (or discards it). The letter is written in the language of the
// resume attached to the application, else the profile's resume language:
// never the UI language, and never translated.
export async function proposeCoverLetter(
  applicationId: unknown,
): Promise<
  { ok: true; text: string } | { ok: false; error: ProposeCoverLetterError }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const id = z.uuid().safeParse(applicationId);
  if (!id.success) return { ok: false, error: "notFound" };

  const app = await getApplication(userId, id.data);
  if (!app) return { ok: false, error: "notFound" };
  const [job, profile, match, version] = await Promise.all([
    getJob(userId, app.jobId),
    getProfile(userId),
    getLatestMatch(userId, app.jobId),
    app.resumeVersionId ? getResumeVersion(userId, app.resumeVersionId) : null,
  ]);
  if (!job) return { ok: false, error: "notFound" };
  if (!job.requirements) return { ok: false, error: "noRequirements" };
  if (!profile) return { ok: false, error: "noProfile" };

  if ((await consumeQuota(userId, "coverLetter")) === "exceeded")
    return { ok: false, error: "quotaExceeded" };
  const result = await draftCoverLetter({
    job: { title: job.title, company: job.company },
    requirements: job.requirements,
    fit: match?.analysis ?? null,
    profile: profile.data,
    letterLanguage: version?.language ?? profile.language,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error === "noProfileBullets" ? "noProfile" : result.error,
    };
  }
  return { ok: true, text: result.text };
}
