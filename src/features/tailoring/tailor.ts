import { generateObject } from "ai";
import type {
  FitAnalysis,
  ParsedRequirements,
  ProfileData,
  TailoredResume,
} from "@/db/schema";
import { MODEL_IDS, tailorResumeModel } from "@/lib/ai/models";
import {
  buildTailorPrompt,
  PROMPT_VERSION,
  TAILOR_RESUME_SYSTEM,
  tailorPlanSchema,
  type TailorPlan,
} from "@/prompts/tailor-resume";
import { profileBullets } from "@/prompts/fit-analysis";
import { assembleResume } from "./assemble";
import { validateTailoring, type TailoringProblem } from "./validate-tailoring";

// `attempts` and `problems` (ids and codes only) are for evals; the app
// ignores them.
export type TailorResult =
  | {
      ok: true;
      plan: TailorPlan;
      resume: TailoredResume;
      model: string;
      promptVersion: string;
      attempts: number;
    }
  | {
      ok: false;
      error: "noProfileBullets" | "parseFailed" | "invalidTailoring";
      problems?: TailoringProblem[];
    };

// One retry: a rejected answer is usually a one-off citation slip.
const MAX_ATTEMPTS = 2;

// The profile is PII: never log the prompt, the output or error details.
export async function tailorResume(input: {
  job: { title: string; company: string };
  requirements: ParsedRequirements;
  fit?: Pick<FitAnalysis, "keywordsToEmphasize" | "gaps"> | null;
  profile: ProfileData;
  resumeLanguage: string;
}): Promise<TailorResult> {
  if (profileBullets(input.profile).length === 0)
    return { ok: false, error: "noProfileBullets" };

  const prompt = buildTailorPrompt(input);
  let lastError: "parseFailed" | "invalidTailoring" = "parseFailed";
  let lastProblems: TailoringProblem[] | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let plan: TailorPlan;
    try {
      ({ object: plan } = await generateObject({
        model: tailorResumeModel(),
        schema: tailorPlanSchema,
        system: TAILOR_RESUME_SYSTEM,
        prompt,
        maxOutputTokens: 16_000,
        providerOptions: {
          anthropic: { effort: "medium", fallbacks: "default" },
        },
      }));
    } catch {
      lastError = "parseFailed";
      lastProblems = undefined;
      continue;
    }
    const problems = validateTailoring(plan, input.profile);
    if (problems.length > 0) {
      lastError = "invalidTailoring";
      lastProblems = problems;
      continue;
    }
    return {
      ok: true,
      plan,
      resume: assembleResume(plan, input.profile),
      model: MODEL_IDS.tailorResume,
      promptVersion: PROMPT_VERSION,
      attempts: attempt + 1,
    };
  }
  return lastProblems
    ? { ok: false, error: lastError, problems: lastProblems }
    : { ok: false, error: lastError };
}
