import { generateObject } from "ai";
import type { TailoredResume } from "@/db/schema";
import { MODEL_IDS, translateResumeModel } from "@/lib/ai/models";
import {
  buildTranslatePrompt,
  PROMPT_VERSION,
  TRANSLATE_RESUME_SYSTEM,
  translateOutputSchema,
} from "@/prompts/translate-resume";
import {
  mergeTranslation,
  validateTranslation,
  type TranslationProblem,
} from "./merge";

// `attempts` and `problems` (paths and codes only) are for evals; the app
// ignores them.
export type TranslateResult =
  | {
      ok: true;
      resume: TailoredResume;
      model: string;
      promptVersion: string;
      attempts: number;
    }
  | {
      ok: false;
      error: "parseFailed" | "invalidTranslation";
      problems?: TranslationProblem[];
    };

// One retry: a rejected answer is usually a one-off slip (a dropped bullet).
const MAX_ATTEMPTS = 2;

// The resume is PII: never log the prompt, the output or error details.
export async function translateResume(input: {
  resume: TailoredResume;
  sourceLanguage: string;
  targetLanguage: string;
}): Promise<TranslateResult> {
  const prompt = buildTranslatePrompt(input);
  let lastError: "parseFailed" | "invalidTranslation" = "parseFailed";
  let lastProblems: TranslationProblem[] | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let out: TailoredResume;
    try {
      ({ object: out } = await generateObject({
        model: translateResumeModel(),
        schema: translateOutputSchema,
        system: TRANSLATE_RESUME_SYSTEM,
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
    const problems = validateTranslation(input.resume, out);
    if (problems.length > 0) {
      lastError = "invalidTranslation";
      lastProblems = problems;
      continue;
    }
    return {
      ok: true,
      resume: mergeTranslation(input.resume, out),
      model: MODEL_IDS.translateResume,
      promptVersion: PROMPT_VERSION,
      attempts: attempt + 1,
    };
  }
  return lastProblems
    ? { ok: false, error: lastError, problems: lastProblems }
    : { ok: false, error: lastError };
}
