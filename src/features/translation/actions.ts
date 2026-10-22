"use server";

import { auth } from "@clerk/nextjs/server";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  getResumeVersion,
  insertResumeVersion,
} from "@/db/queries/resume-versions";
import { consumeQuota } from "@/db/queries/usage";
import { resumeLanguageSchema } from "@/features/profile/schemas";
import { languageName } from "@/lib/language-name";
import { translateResume } from "./translate";

const translateInput = z.object({
  id: z.uuid(),
  targetLanguage: resumeLanguageSchema,
});

export type TranslateVersionError =
  | "unauthorized"
  | "invalid"
  | "notFound"
  | "sameLanguage"
  | "parseFailed"
  | "invalidTranslation"
  | "quotaExceeded"
  | "failed";

// Translation is always an explicit action and always creates a new
// version; the source version is never changed.
export async function translateResumeVersion(
  input: unknown,
): Promise<
  { ok: true; id: string } | { ok: false; error: TranslateVersionError }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  const parsed = translateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { id, targetLanguage } = parsed.data;

  const [source, t, locale] = await Promise.all([
    getResumeVersion(userId, id),
    getTranslations("Resumes.translate"),
    getLocale(),
  ]);
  if (!source) return { ok: false, error: "notFound" };
  if (source.language === targetLanguage)
    return { ok: false, error: "sameLanguage" };

  if ((await consumeQuota(userId, "translateResume")) === "exceeded")
    return { ok: false, error: "quotaExceeded" };
  const result = await translateResume({
    resume: source.data,
    sourceLanguage: source.language,
    targetLanguage,
  });
  if (!result.ok) return { ok: false, error: result.error };

  try {
    const newId = await insertResumeVersion(userId, {
      jobId: source.jobId,
      name: t("name", {
        name: source.name,
        language: languageName(targetLanguage, locale),
      }).slice(0, 120),
      data: result.resume,
      isAiGenerated: true,
      model: result.model,
      promptVersion: result.promptVersion,
      language: targetLanguage,
      sourceVersionId: source.id,
    });
    return { ok: true, id: newId };
  } catch {
    return { ok: false, error: "failed" };
  }
}
