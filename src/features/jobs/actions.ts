"use server";

import { auth } from "@clerk/nextjs/server";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import {
  deleteJob as deleteJobRow,
  getJob,
  getJobPosting,
  markPostingChecked,
  updateJobPosting,
  upsertJob,
} from "@/db/queries/jobs";
import { insertMatch } from "@/db/queries/matches";
import { getProfile } from "@/db/queries/profile";
import { consumeQuota } from "@/db/queries/usage";
import { analyzeFit } from "./analyze-fit";
import { importerFor } from "./boards";
import type { BoardImportError, BoardPosting } from "./boards/common";
import {
  MAX_POSTING_CHARS,
  postingFromHtml,
  postingFromPaste,
} from "./extract-job-text";
import { fetchJobPage, type FetchError } from "./fetch-job-page";
import {
  importGreenhouseJob,
  parseGreenhouseUrl,
  type GreenhouseImportError,
} from "./greenhouse";
import { jobFields, parseAndEmbed, type IngestError } from "./ingest";
import { boardPostingText, checkPosting, sameDescription } from "./refresh";

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
  | GreenhouseImportError
  | BoardImportError
  | "needsPaste"
  | "tooShort"
  | "tooLong"
  | "parseFailed"
  | "noRequirements"
  | "embedFailed"
  | "embedRateLimited"
  | "quotaExceeded"
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
  let source: "url" | "manual" | "greenhouse" | "lever" | "ashby";
  let storedUrl: string | null = null;
  let board: BoardPosting | null = null;
  const greenhouseTarget = text?.trim() ? null : parseGreenhouseUrl(url!);
  const boardImporter = text?.trim() ? null : importerFor(url!);
  if (text?.trim()) {
    const pasted = postingFromPaste(text);
    if (!pasted.ok) return { ok: false, error: pasted.error };
    posting = pasted.text;
    source = "manual";
    storedUrl = url && URL.canParse(url) && /^https?:/i.test(url) ? url : null;
  } else if (greenhouseTarget || boardImporter) {
    // Board URLs go to the board's public API, never through the page
    // fetcher's site checks.
    const imported = greenhouseTarget
      ? await importGreenhouseJob(greenhouseTarget)
      : await boardImporter!.run();
    if (!imported.ok) return { ok: false, error: imported.error };
    board = imported.posting;
    if (board.description.length > MAX_POSTING_CHARS)
      return {
        ok: false,
        error: greenhouseTarget ? "greenhouseUnavailable" : "boardUnavailable",
      };
    posting = boardPostingText(board);
    source = greenhouseTarget ? "greenhouse" : boardImporter!.source;
    storedUrl = board.url;
  } else {
    const page = await fetchJobPage(url!);
    if (!page.ok) return { ok: false, error: page.error };
    const extracted = postingFromHtml(page.html);
    if (!extracted.ok) return { ok: false, error: extracted.error };
    posting = extracted.text;
    source = "url";
    storedUrl = page.finalUrl;
  }

  if ((await consumeQuota(userId, "parseJob")) === "exceeded")
    return { ok: false, error: "quotaExceeded" };
  const parsed = await parseAndEmbed(posting);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    const jobId = await upsertJob(userId, {
      source,
      externalId: board?.externalId ?? null,
      url: storedUrl,
      ...jobFields(parsed, board, posting),
    });
    return { ok: true, jobId };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export type CheckJobError =
  | "unauthorized"
  | "notFound"
  | "unsupported"
  | "unavailable"
  | "quotaExceeded"
  | "tooLong"
  | IngestError
  | "failed";

export type CheckJobResult =
  | { ok: true; outcome: "open" | "updated" | "closed" }
  | { ok: false; error: CheckJobError };

// Asks the job board again whether an imported posting is still open. A
// posting whose text changed is parsed and embedded again (one parseJob
// call); an unchanged one costs nothing. Earlier fit analyses are kept as
// they were. Only Greenhouse, Lever and Ashby postings can be checked.
export async function checkJobPosting(jobId: unknown): Promise<CheckJobResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const id = z.uuid().safeParse(jobId);
  if (!id.success) return { ok: false, error: "notFound" };

  try {
    const stored = await getJobPosting(userId, id.data);
    if (!stored) return { ok: false, error: "notFound" };
    const check = await checkPosting(stored);
    if (check.state === "unsupported" || check.state === "unavailable")
      return { ok: false, error: check.state };
    if (check.state === "closed") {
      await markPostingChecked(userId, stored.id, "closed");
      return { ok: true, outcome: "closed" };
    }

    // Open: record that first, so a failed re-parse still clears "closed".
    await markPostingChecked(userId, stored.id, "open");
    const board = check.posting;
    if (sameDescription(board.description, stored.descriptionRaw))
      return { ok: true, outcome: "open" };
    if (board.description.length > MAX_POSTING_CHARS)
      return { ok: false, error: "tooLong" };

    if ((await consumeQuota(userId, "parseJob")) === "exceeded")
      return { ok: false, error: "quotaExceeded" };
    const posting = boardPostingText(board);
    const parsed = await parseAndEmbed(posting);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    await updateJobPosting(
      userId,
      stored.id,
      jobFields(parsed, board, posting),
    );
    return { ok: true, outcome: "updated" };
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
  | "quotaExceeded"
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

  if ((await consumeQuota(userId, "fitAnalysis")) === "exceeded")
    return { ok: false, error: "quotaExceeded" };
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

export type DeleteJobError = "unauthorized" | "notFound" | "failed";

// Removes the job with its fit analyses, application, timeline and
// contacts. Tailored resume versions stay, detached from the job.
export async function deleteJob(
  jobId: unknown,
): Promise<{ ok: true } | { ok: false; error: DeleteJobError }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const id = z.uuid().safeParse(jobId);
  if (!id.success) return { ok: false, error: "notFound" };
  try {
    return (await deleteJobRow(userId, id.data))
      ? { ok: true }
      : { ok: false, error: "notFound" };
  } catch {
    return { ok: false, error: "failed" };
  }
}
