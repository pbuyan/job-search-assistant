import { generateObject } from "ai";
import { parseResumeModel } from "@/lib/ai/models";
import {
  buildParseResumePrompt,
  PARSE_RESUME_SYSTEM,
  parseResumeOutputSchema,
  PROMPT_VERSION,
} from "@/prompts/parse-resume";
import type { ProfileDataInput } from "@/prompts/schemas";
import { normalizeProfile } from "./normalize";

export type ParseResumeResult =
  | {
      ok: true;
      data: ProfileDataInput;
      /** ISO 639-1 code the model detected (not validated against RESUME_LANGUAGES). */
      language: string;
      promptVersion: string;
    }
  | { ok: false; error: "parseFailed" | "noContent" };

// Only the sections the profile form can show for review are kept; anything
// else the model returned is dropped rather than saved unseen. Every id is
// replaced with a fresh nanoid — the model is told to leave them blank, and
// we never trust model-made ids.
export function toReviewableProfile(data: ProfileDataInput): ProfileDataInput {
  const fresh = normalizeProfile({
    basics: { ...data.basics, links: undefined },
    work: data.work.map((job) => ({
      ...job,
      id: "",
      bullets: job.bullets.map((b) => ({ id: "", text: b.text })),
    })),
    education: data.education ?? [],
    skills: data.skills,
  });
  const { basics, work, education, skills } = fresh;
  return { basics, work, education: education ?? [], skills };
}

// The caller must never log `text` or anything derived from it. Failures are
// reported as codes only: AI SDK errors can carry the prompt or the raw
// model output.
export async function parseResume(text: string): Promise<ParseResumeResult> {
  let output;
  try {
    ({ object: output } = await generateObject({
      model: parseResumeModel(),
      schema: parseResumeOutputSchema,
      system: PARSE_RESUME_SYSTEM,
      prompt: buildParseResumePrompt(text),
      maxOutputTokens: 16_000,
      providerOptions: {
        // Extraction is mechanical; low effort keeps latency and cost down.
        anthropic: { effort: "low", fallbacks: "default" },
      },
    }));
  } catch {
    return { ok: false, error: "parseFailed" };
  }

  const data = toReviewableProfile(output.data);
  if (!data.basics.name && data.work.length === 0 && data.education?.length === 0) {
    return { ok: false, error: "noContent" };
  }
  return {
    ok: true,
    data,
    language: output.language.trim().toLowerCase().slice(0, 2),
    promptVersion: PROMPT_VERSION,
  };
}
