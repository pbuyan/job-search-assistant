import { generateObject } from "ai";
import { MODEL_IDS, parseJobModel } from "@/lib/ai/models";
import {
  buildParseJobPrompt,
  PARSE_JOB_SYSTEM,
  parseJobOutputSchema,
  PROMPT_VERSION,
  type ParseJobOutput,
} from "@/prompts/parse-job";

export type ParseJobResult =
  | { ok: true; output: ParseJobOutput; model: string; promptVersion: string }
  | { ok: false; error: "parseFailed" | "noRequirements" };

// Failures are reported as codes only: AI SDK errors can carry the prompt.
export async function parseJob(postingText: string): Promise<ParseJobResult> {
  let output: ParseJobOutput;
  try {
    ({ object: output } = await generateObject({
      model: parseJobModel(),
      schema: parseJobOutputSchema,
      system: PARSE_JOB_SYSTEM,
      prompt: buildParseJobPrompt(postingText),
      maxOutputTokens: 16_000,
      providerOptions: { anthropic: { effort: "low", fallbacks: "default" } },
    }));
  } catch {
    return { ok: false, error: "parseFailed" };
  }

  const { mustHave, niceToHave } = output.requirements;
  if (mustHave.length + niceToHave.length === 0)
    return { ok: false, error: "noRequirements" };

  return {
    ok: true,
    output: {
      ...output,
      language: output.language.trim().toLowerCase().slice(0, 2),
    },
    model: MODEL_IDS.parseJob,
    promptVersion: PROMPT_VERSION,
  };
}
