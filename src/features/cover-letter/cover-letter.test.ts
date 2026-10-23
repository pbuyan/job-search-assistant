// @vitest-environment node
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedRequirements, ProfileData } from "@/db/schema";
import type { CoverLetterDraft } from "@/prompts/cover-letter";
import { buildCoverLetterPrompt } from "@/prompts/cover-letter";
import { draftCoverLetter } from "./draft";
import { coverLetterText, validateCoverLetter } from "./validate";

let model: MockLanguageModelV4;
vi.mock("@/lib/ai/models", () => ({
  coverLetterModel: () => model,
  MODEL_IDS: { coverLetter: "test-model" },
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user-1" }),
}));

const profile: ProfileData = {
  basics: { name: "Ada", summary: "Payments engineer." },
  work: [
    {
      id: "work-acme",
      company: "Acme",
      position: "Senior Engineer",
      startDate: "2019-01",
      bullets: [
        {
          id: "b-latency",
          text: "Cut checkout latency by 40% across 1,200 stores",
        },
        { id: "b-oncall", text: "Led the on-call rotation for payments" },
      ],
    },
  ],
  skills: [{ category: "Languages", items: ["Go"] }],
};
const job = { title: "Staff Engineer", company: "Northwind" };
const requirements: ParsedRequirements = {
  mustHave: ["Payments experience"],
  niceToHave: ["Kubernetes"],
  techStack: ["Go"],
  responsibilities: ["Own checkout reliability"],
};

const good: CoverLetterDraft = {
  paragraphs: [
    {
      text: "I'm applying for the Staff Engineer role at Northwind.",
      sourceBulletIds: [],
    },
    {
      text: "At Acme I cut checkout latency by 40% across 1 200 stores and led the payments on-call rotation.",
      sourceBulletIds: ["b-latency", "b-oncall"],
    },
    { text: "I'd welcome the chance to talk.", sourceBulletIds: [] },
  ],
};

const reply = (object: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(object) }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
  warnings: [],
});

describe("validateCoverLetter", () => {
  it("accepts a letter whose claims and numbers come from cited bullets", () => {
    expect(validateCoverLetter(good, profile, job)).toEqual([]);
    expect(coverLetterText(good).split("\n\n")).toHaveLength(3);
  });

  it("rejects unknown ids, new numbers, placeholders and evidence-free letters", () => {
    const bad: CoverLetterDraft = {
      paragraphs: [
        { text: "Dear [Hiring Manager],", sourceBulletIds: [] },
        { text: "I have 10 years in payments.", sourceBulletIds: ["b-oncall"] },
        { text: "I built Kubernetes platforms.", sourceBulletIds: ["b-k8s"] },
      ],
    };
    expect(validateCoverLetter(bad, profile, job)).toEqual([
      { kind: "placeholder", paragraph: 0 },
      { kind: "newNumber", paragraph: 1 },
      { kind: "unknownBullet", paragraph: 2, sourceBulletId: "b-k8s" },
    ]);
    const noEvidence: CoverLetterDraft = {
      paragraphs: [
        { text: "Hello.", sourceBulletIds: [] },
        { text: "Thanks.", sourceBulletIds: [] },
      ],
    };
    expect(validateCoverLetter(noEvidence, profile, job)).toEqual([
      { kind: "noEvidence" },
    ]);
  });

  it("allows numbers from the job's own title, and needs 2 to 6 paragraphs", () => {
    const level: CoverLetterDraft = {
      paragraphs: [
        { text: "Applying for Engineer 3.", sourceBulletIds: [] },
        good.paragraphs[1],
      ],
    };
    expect(
      validateCoverLetter(level, profile, {
        title: "Engineer 3",
        company: "N",
      }),
    ).toEqual([]);
    expect(
      validateCoverLetter({ paragraphs: [good.paragraphs[1]] }, profile, job),
    ).toEqual([{ kind: "length", paragraphs: 1 }]);
  });
});

describe("buildCoverLetterPrompt", () => {
  it("lists gaps as things never to claim and asks for the letter language", () => {
    const prompt = buildCoverLetterPrompt({
      job,
      requirements,
      fit: {
        matched: [
          {
            requirementId: "must:0",
            requirement: "Payments",
            evidenceBulletIds: ["b-oncall"],
          },
        ],
        gaps: [
          {
            requirementId: "nice:0",
            requirement: "Kubernetes",
            severity: "major",
          },
        ],
        keywordsToEmphasize: ["payments"],
      },
      profile,
      letterLanguage: "fr",
    });
    expect(prompt).toContain("Letter language: fr");
    expect(prompt).toContain("Gaps (never claim these):\n- Kubernetes");
    expect(prompt).toContain(
      "- b-latency (Senior Engineer, Acme): Cut checkout",
    );
    expect(prompt).not.toContain("Ada");
  });
});

describe("draftCoverLetter", () => {
  it("retries once after an invalid answer, then returns the letter", async () => {
    let calls = 0;
    model = new MockLanguageModelV4({
      doGenerate: async () =>
        reply(
          calls++ === 0
            ? {
                paragraphs: [
                  { text: "I have 12 years.", sourceBulletIds: ["b-x"] },
                  good.paragraphs[0],
                ],
              }
            : good,
        ),
    });
    const result = await draftCoverLetter({
      job,
      requirements,
      profile,
      letterLanguage: "en",
    });
    expect(result).toMatchObject({
      ok: true,
      attempts: 2,
      promptVersion: "cover-letter@1",
      model: "test-model",
    });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("gives up after two invalid answers and needs profile bullets", async () => {
    model = new MockLanguageModelV4({
      doGenerate: async () =>
        reply({ paragraphs: [{ text: "Hi.", sourceBulletIds: [] }] }),
    });
    const result = await draftCoverLetter({
      job,
      requirements,
      profile,
      letterLanguage: "en",
    });
    expect(result).toMatchObject({ ok: false, error: "invalidCoverLetter" });

    const empty = await draftCoverLetter({
      job,
      requirements,
      profile: { ...profile, work: [] },
      letterLanguage: "en",
    });
    expect(empty).toEqual({ ok: false, error: "noProfileBullets" });
  });
});

// ---- the Server Action ----
const APP = "11111111-1111-4111-8111-111111111111";
const VERSION = "22222222-2222-4222-8222-222222222222";
const getApplication = vi.fn(
  async (): Promise<{
    jobId: string;
    resumeVersionId: string | null;
  } | null> => ({
    jobId: "job-1",
    resumeVersionId: VERSION,
  }),
);
vi.mock("@/db/queries/applications", () => ({
  getApplication: () => getApplication(),
}));
vi.mock("@/db/queries/jobs", () => ({
  getJob: async () => ({ ...job, requirements }),
}));
vi.mock("@/db/queries/matches", () => ({ getLatestMatch: async () => null }));
vi.mock("@/db/queries/profile", () => ({
  getProfile: async () => ({ data: profile, language: "en" }),
}));
const getResumeVersion = vi.fn(async () => ({ language: "fr" }));
vi.mock("@/db/queries/resume-versions", () => ({
  getResumeVersion: () => getResumeVersion(),
}));
const consumeQuota = vi.fn(async (): Promise<"ok" | "exceeded"> => "ok");
vi.mock("@/db/queries/usage", () => ({
  consumeQuota: (...a: unknown[]) => consumeQuota(...(a as [])),
}));

describe("proposeCoverLetter", () => {
  beforeEach(() => {
    model = new MockLanguageModelV4({ doGenerate: async () => reply(good) });
  });

  it("writes in the attached resume's language and returns a proposal only", async () => {
    const { proposeCoverLetter } = await import("./actions");
    const result = await proposeCoverLetter(APP);
    expect(result).toEqual({ ok: true, text: coverLetterText(good) });
    expect(consumeQuota).toHaveBeenCalledWith("user-1", "coverLetter");
    const prompt = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(prompt).toContain("Letter language: fr");
  });

  it("falls back to the profile's resume language without an attached resume", async () => {
    const { proposeCoverLetter } = await import("./actions");
    getApplication.mockResolvedValueOnce({
      jobId: "job-1",
      resumeVersionId: null,
    });
    await proposeCoverLetter(APP);
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain(
      "Letter language: en",
    );
  });

  it("stops before the model call over the daily cap, and on a bad id", async () => {
    const { proposeCoverLetter } = await import("./actions");
    consumeQuota.mockResolvedValueOnce("exceeded");
    expect(await proposeCoverLetter(APP)).toEqual({
      ok: false,
      error: "quotaExceeded",
    });
    expect(await proposeCoverLetter("nope")).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});
