import { z } from "zod";
import { routing } from "@/i18n/routing";
import { profileDataSchema } from "@/prompts/schemas";

export const localeSchema = z.enum(routing.locales);

// Resume language is its own setting (profiles.language) — never derived from
// the UI locale. The set happens to match today's UI locales, but is declared
// separately so the two can diverge.
export const RESUME_LANGUAGES = ["en", "fr"] as const;
export const resumeLanguageSchema = z.enum(RESUME_LANGUAGES);
export type ResumeLanguage = z.infer<typeof resumeLanguageSchema>;

// Ids are minted with nanoid; anything else is treated as "no id yet".
export const STABLE_ID = /^[A-Za-z0-9_-]{8,64}$/;

// Wraps the shared ProfileData schema with the checks a form needs. Issue
// messages are next-intl keys under `Profile.errors`, so the same schema can
// drive client validation and the Server Action.
export const profileShapeSchema = z.object({
  language: resumeLanguageSchema,
  data: profileDataSchema,
});

export const profileSaveSchema = profileShapeSchema.superRefine(({ data }, ctx) => {
    const required = (path: (string | number)[], value: string | undefined) => {
      if (!value?.trim()) ctx.addIssue({ code: "custom", path, message: "required" });
    };
    required(["data", "basics", "name"], data.basics.name);
    data.work.forEach((job, i) => {
      required(["data", "work", i, "company"], job.company);
      required(["data", "work", i, "position"], job.position);
      required(["data", "work", i, "startDate"], job.startDate);
      job.bullets.forEach((b, j) =>
        required(["data", "work", i, "bullets", j, "text"], b.text),
      );
    });
    data.education?.forEach((ed, i) =>
      required(["data", "education", i, "institution"], ed.institution),
    );
    data.skills.forEach((s, i) => required(["data", "skills", i, "category"], s.category));

    // Bullet ids are how tailored resumes cite their source, so they must be
    // unique across the whole profile.
    const seen = new Set<string>();
    const bulletLists = [
      ...data.work.map((w, i) => ({ path: ["data", "work", i], bullets: w.bullets })),
      ...(data.projects ?? []).map((p, i) => ({
        path: ["data", "projects", i],
        bullets: p.bullets,
      })),
    ];
    for (const { path, bullets } of bulletLists) {
      bullets.forEach((b, j) => {
        if (seen.has(b.id)) {
          ctx.addIssue({
            code: "custom",
            path: [...path, "bullets", j, "id"],
            message: "duplicateId",
          });
        }
        seen.add(b.id);
      });
    }
  });

export type ProfileSaveInput = z.infer<typeof profileSaveSchema>;
