// src/prompts/schemas.ts — Zod schemas mirroring the JSONB types declared in
// src/db/schema.ts (ProfileData, ParsedRequirements, FitAnalysis,
// TailoredResume). Every generateObject call that produces one of these
// shapes should import its schema from here rather than redeclaring it, so
// the LLM output contract and the storage contract can't drift apart.
//
// Keep this file in sync by hand whenever src/db/schema.ts's JSONB types
// change — there's no codegen between the two.
import { z } from "zod";

export const bulletSchema = z.object({
  id: z.string(),
  text: z.string(),
  skills: z.array(z.string()).optional(),
});

export const profileDataSchema = z.object({
  basics: z.object({
    name: z.string(),
    label: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    summary: z.string().optional(),
    links: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
  }),
  work: z.array(
    z.object({
      id: z.string(),
      company: z.string(),
      position: z.string(),
      startDate: z.string(),
      endDate: z.string().optional(),
      location: z.string().optional(),
      bullets: z.array(bulletSchema),
    }),
  ),
  projects: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        url: z.string().optional(),
        bullets: z.array(bulletSchema),
      }),
    )
    .optional(),
  education: z
    .array(
      z.object({
        institution: z.string(),
        area: z.string().optional(),
        studyType: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    )
    .optional(),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  certifications: z
    .array(
      z.object({
        name: z.string(),
        issuer: z.string().optional(),
        date: z.string().optional(),
      }),
    )
    .optional(),
  languages: z
    .array(z.object({ language: z.string(), fluency: z.string().optional() }))
    .optional(),
});

export const parsedRequirementsSchema = z.object({
  mustHave: z.array(z.string()),
  niceToHave: z.array(z.string()),
  seniority: z.enum(["junior", "mid", "senior", "staff", "lead", "principal"]).optional(),
  yearsExperience: z.number().optional(),
  techStack: z.array(z.string()),
  responsibilities: z.array(z.string()),
});

export const fitAnalysisSchema = z.object({
  summary: z.string(),
  matched: z.array(
    z.object({
      requirement: z.string(),
      evidenceBulletIds: z.array(z.string()),
    }),
  ),
  gaps: z.array(
    z.object({
      requirement: z.string(),
      severity: z.enum(["minor", "major"]),
      suggestion: z.string().optional(),
    }),
  ),
  keywordsToEmphasize: z.array(z.string()),
});

// Tailored bullets must cite a master bullet — the prompt is told to do
// this, but it's enforced here and in code: any bullet whose
// sourceBulletId doesn't resolve to a real profile bullet is rejected
// before it ever reaches resume_versions.
export const tailoredBulletSchema = z.object({
  text: z.string(),
  sourceBulletId: z.string(),
});

export const tailoredResumeSchema = profileDataSchema.omit({ work: true, projects: true }).extend({
  work: z.array(
    z.object({
      sourceWorkId: z.string(),
      company: z.string(),
      position: z.string(),
      startDate: z.string(),
      endDate: z.string().optional(),
      bullets: z.array(tailoredBulletSchema),
    }),
  ),
  projects: z
    .array(
      z.object({
        sourceProjectId: z.string(),
        name: z.string(),
        bullets: z.array(tailoredBulletSchema),
      }),
    )
    .optional(),
});

export type BulletInput = z.infer<typeof bulletSchema>;
export type ProfileDataInput = z.infer<typeof profileDataSchema>;
export type ParsedRequirementsInput = z.infer<typeof parsedRequirementsSchema>;
export type FitAnalysisInput = z.infer<typeof fitAnalysisSchema>;
export type TailoredBulletInput = z.infer<typeof tailoredBulletSchema>;
export type TailoredResumeInput = z.infer<typeof tailoredResumeSchema>;
