import { generateObject } from "ai";
import type { FitAnalysis, ParsedRequirements, ProfileData } from "@/db/schema";
import { fitAnalysisModel, MODEL_IDS } from "@/lib/ai/models";
import {
  buildFitPrompt,
  FIT_ANALYSIS_SYSTEM,
  fitAnalysisOutputSchema,
  profileBullets,
  PROMPT_VERSION,
  requirementRefs,
  type FitAnalysisOutput,
} from "@/prompts/fit-analysis";
import { computeScore } from "./score";
import { validateFit, type FitProblem } from "./validate-fit";

// `attempts` and `problems` (ids and codes only) are for evals; the app
// ignores them.
export type AnalyzeFitResult =
  | {
      ok: true;
      analysis: FitAnalysis;
      score: number;
      model: string;
      promptVersion: string;
      analysisLanguage: string;
      attempts: number;
    }
  | {
      ok: false;
      error:
        | "noRequirements"
        | "noProfileBullets"
        | "parseFailed"
        | "invalidAnalysis";
      problems?: FitProblem[];
    };

// One retry: a rejected answer is usually a one-off citation slip.
const MAX_ATTEMPTS = 2;

// The profile is PII: never log the prompt, the output or error details.
export async function analyzeFit(input: {
  requirements: ParsedRequirements;
  profile: ProfileData;
  outputLanguage: string;
}): Promise<AnalyzeFitResult> {
  const requirements = requirementRefs(input.requirements);
  if (requirements.length === 0) return { ok: false, error: "noRequirements" };
  const bulletIds = new Set(profileBullets(input.profile).map((b) => b.id));
  if (bulletIds.size === 0) return { ok: false, error: "noProfileBullets" };

  const prompt = buildFitPrompt({
    requirements,
    profile: input.profile,
    outputLanguage: input.outputLanguage,
  });

  let lastError: "parseFailed" | "invalidAnalysis" = "parseFailed";
  let lastProblems: FitProblem[] | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let output: FitAnalysisOutput;
    try {
      ({ object: output } = await generateObject({
        model: fitAnalysisModel(),
        schema: fitAnalysisOutputSchema,
        system: FIT_ANALYSIS_SYSTEM,
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
    const problems = validateFit(output, requirements, bulletIds);
    if (problems.length > 0) {
      lastError = "invalidAnalysis";
      lastProblems = problems;
      continue;
    }
    return {
      ok: true,
      analysis: output,
      score: computeScore(requirements, output),
      model: MODEL_IDS.fitAnalysis,
      promptVersion: PROMPT_VERSION,
      analysisLanguage: input.outputLanguage,
      attempts: attempt + 1,
    };
  }
  return lastProblems
    ? { ok: false, error: lastError, problems: lastProblems }
    : { ok: false, error: lastError };
}
