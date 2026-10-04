"use server";

import { auth } from "@clerk/nextjs/server";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { createJob as insertJob, getJob } from "@/db/queries/jobs";
import { insertMatch } from "@/db/queries/matches";
import { getProfile } from "@/db/queries/profile";
import { embedDocument } from "@/lib/ai/embeddings";
import { analyzeFit } from "./analyze-fit";
import { postingFromHtml, postingFromPaste } from "./extract-job-text";
import { fetchJobPage, type FetchError } from "./fetch-job-page";
import { parseJob } from "./parse-job";

const createJobInput = z
  .object({
    url: z.string().trim().max(2048).optional(),
    text: z.string().max(200_000).optional(),
  })
  .refine((v) => !!v.url || !!v.text?.trim());

export type CreateJobError =
  | "unauthorized"
  | "invalid"
  | FetchError
  | "needsPaste"
  | "tooShort"
  | "tooLong"
  | "parseFailed"
  | "noRequirements"
  | "embedFailed"
  | "failed";

export type CreateJobResult =
  { ok: true; jobId: string } | { ok: false; error: CreateJobError };

// Pasted text wins when both are given; the URL is then kept as a reference
// and not fetched. Nothing here logs posting text or error details.
export async function createJob(input: unknown): Promise<CreateJobResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsedInput = createJobInput.safeParse(input);
  if (!parsedInput.success) return { ok: false, error: "invalid" };
  const { url, text } = parsedInput.data;

  let posting: string;
  let source: "url" | "manual";
  let storedUrl: string | null = null;
  if (text?.trim()) {
    const pasted = postingFromPaste(text);
    if (!pasted.ok) return { ok: false, error: pasted.error };
    posting = pasted.text;
    source = "manual";
    storedUrl = url && URL.canParse(url) && /^https?:/i.test(url) ? url : null;
  } else {
    const page = await fetchJobPage(url!);
    if (!page.ok) return { ok: false, error: page.error };
    const extracted = postingFromHtml(page.html);
    if (!extracted.ok) return { ok: false, error: extracted.error };
    posting = extracted.text;
    source = "url";
    storedUrl = page.finalUrl;
  }

  const parsed = await parseJob(posting);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { job, requirements, language } = parsed.output;

  let embedding: number[];
  try {
    embedding = await embedDocument(
      [job.title, job.company, job.location ?? "", posting]
        .filter(Boolean)
        .join("\n"),
    );
  } catch {
    return { ok: false, error: "embedFailed" };
  }

  try {
    const jobId = await insertJob(userId, {
      source,
      url: storedUrl,
      company: job.company,
      title: job.title,
      location: job.location ?? null,
      remote: job.remote,
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      salaryCurrency: job.salaryCurrency ?? null,
      descriptionRaw: posting,
      requirements,
      requirementsModel: parsed.model,
      requirementsPromptVersion: parsed.promptVersion,
      embedding,
      language,
    });
    return { ok: true, jobId };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export type AnalyzeJobError =
  | "unauthorized"
  | "notFound"
  | "noProfile"
  | "noRequirements"
  | "parseFailed"
  | "invalidAnalysis"
  | "failed";

// The analysis is written in the user's current UI locale, which is passed to
// the prompt as a parameter; the prompt itself stays English.
export async function analyzeJob(
  jobId: unknown,
): Promise<{ ok: true } | { ok: false; error: AnalyzeJobError }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const id = z.uuid().safeParse(jobId);
  if (!id.success) return { ok: false, error: "notFound" };

  const [job, profile, locale] = await Promise.all([
    getJob(userId, id.data),
    getProfile(userId),
    getLocale(),
  ]);
  if (!job) return { ok: false, error: "notFound" };
  if (!job.requirements) return { ok: false, error: "noRequirements" };
  if (!profile) return { ok: false, error: "noProfile" };

  const result = await analyzeFit({
    requirements: job.requirements,
    profile: profile.data,
    outputLanguage: locale,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error === "noProfileBullets" ? "noProfile" : result.error,
    };
  }

  try {
    await insertMatch(userId, {
      jobId: job.id,
      score: result.score,
      analysis: result.analysis,
      model: result.model,
      promptVersion: result.promptVersion,
      analysisLanguage: result.analysisLanguage,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "failed" };
  }
}
