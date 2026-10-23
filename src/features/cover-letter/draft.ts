import { generateObject } from "ai";
import type { FitAnalysis, ParsedRequirements, ProfileData } from "@/db/schema";
import { coverLetterModel, MODEL_IDS } from "@/lib/ai/models";
import {
  buildCoverLetterPrompt,
  COVER_LETTER_SYSTEM,
  coverLetterSchema,
  PROMPT_VERSION,
  type CoverLetterDraft,
} from "@/prompts/cover-letter";
import { profileBullets } from "@/prompts/fit-analysis";
import {
  coverLetterText,
  validateCoverLetter,
  type CoverLetterProblem,
} from "./validate";

// `draft`, `attempts` and `problems` (ids and codes only) are for evals; the
// app uses `text`.
export type CoverLetterResult =
  | {
      ok: true;
      draft: CoverLetterDraft;
      text: string;
      model: string;
      promptVersion: string;
      attempts: number;
    }
  | {
      ok: false;
      error: "noProfileBullets" | "parseFailed" | "invalidCoverLetter";
      problems?: CoverLetterProblem[];
    };

// One retry: a rejected answer is usually a one-off citation or number slip.
const MAX_ATTEMPTS = 2;

// The profile is PII: never log the prompt, the output or error details.
export async function draftCoverLetter(input: {
  job: { title: string; company: string };
  requirements: ParsedRequirements;
  fit?: Pick<FitAnalysis, "matched" | "gaps" | "keywordsToEmphasize"> | null;
  profile: ProfileData;
  letterLanguage: string;
}): Promise<CoverLetterResult> {
  if (profileBullets(input.profile).length === 0)
    return { ok: false, error: "noProfileBullets" };

  const prompt = buildCoverLetterPrompt(input);
  let lastError: "parseFailed" | "invalidCoverLetter" = "parseFailed";
  let lastProblems: CoverLetterProblem[] | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let draft: CoverLetterDraft;
    try {
      ({ object: draft } = await generateObject({
        model: coverLetterModel(),
        schema: coverLetterSchema,
        system: COVER_LETTER_SYSTEM,
        prompt,
        maxOutputTokens: 8_000,
        providerOptions: {
          anthropic: { effort: "medium", fallbacks: "default" },
        },
      }));
    } catch {
      lastError = "parseFailed";
      lastProblems = undefined;
      continue;
    }
    const problems = validateCoverLetter(draft, input.profile, input.job);
    if (problems.length > 0) {
      lastError = "invalidCoverLetter";
      lastProblems = problems;
      continue;
    }
    return {
      ok: true,
      draft,
      text: coverLetterText(draft),
      model: MODEL_IDS.coverLetter,
      promptVersion: PROMPT_VERSION,
      attempts: attempt + 1,
    };
  }
  return lastProblems
    ? { ok: false, error: lastError, problems: lastProblems }
    : { ok: false, error: lastError };
}
