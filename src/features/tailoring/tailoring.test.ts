// @vitest-environment node
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedRequirements, ProfileData } from "@/db/schema";
import type { TailorPlan } from "@/prompts/tailor-resume";
import { assembleResume } from "./assemble";
import { planFromResume, toDraft, toPlan } from "./draft";
import { tailorResume } from "./tailor";
import {
  numbersIn,
  validateTailoring,
  validateTailoringStructure,
} from "./validate-tailoring";

let model: MockLanguageModelV4;
vi.mock("@/lib/ai/models", () => ({
  tailorResumeModel: () => model,
  MODEL_IDS: { tailorResume: "test-model" },
}));

const insertResumeVersion = vi.fn(
  async () => "11111111-1111-4111-8111-111111111111",
);
const updateResumeVersionData = vi.fn(
  async (): Promise<"ok" | "locked" | "notFound"> => "ok",
);
const duplicateResumeVersion = vi.fn(
  async () => "33333333-3333-4333-8333-333333333333",
);
const getResumeVersion = vi.fn(
  async (): Promise<{ name: string; language: string } | null> => ({
    name: "Northwind",
    language: "en",
  }),
);
vi.mock("@/db/queries/resume-versions", () => ({
  insertResumeVersion: (...args: unknown[]) =>
    insertResumeVersion(...(args as [])),
  updateResumeVersionData: (...args: unknown[]) =>
    updateResumeVersionData(...(args as [])),
  duplicateResumeVersion: (...args: unknown[]) =>
    duplicateResumeVersion(...(args as [])),
  getResumeVersion: () => getResumeVersion(),
  renameResumeVersion: vi.fn(),
  deleteResumeVersion: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values: { name: string }) =>
    key === "copyName" ? `${values.name} (copy)` : key,
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user-1" }),
}));

const profile: ProfileData = {
  basics: {
    name: "Ada",
    email: "ada@example.com",
    summary: "Engineer with 8 years in payments.",
  },
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
    {
      id: "work-initech",
      company: "Initech",
      position: "Engineer",
      startDate: "2016-01",
      endDate: "2018-12",
      bullets: [{ id: "b-reports", text: "Built TPS report tooling" }],
    },
  ],
  projects: [
    {
      id: "proj-cli",
      name: "CLI",
      bullets: [{ id: "b-cli", text: "Wrote a CLI in Go" }],
    },
  ],
  skills: [
    { category: "Languages", items: ["TypeScript", "Go"] },
    { category: "Data", items: ["PostgreSQL"] },
  ],
  education: [{ institution: "UofT" }],
};
const getProfile = vi.fn(async () => ({ data: profile, language: "en" }));
const getJob = vi.fn(async (): Promise<{ id: string } | null> => ({
  id: "job",
}));
vi.mock("@/db/queries/profile", () => ({ getProfile: () => getProfile() }));
vi.mock("@/db/queries/jobs", () => ({ getJob: () => getJob() }));
vi.mock("@/db/queries/matches", () => ({ getLatestMatch: async () => null }));

const good: TailorPlan = {
  summary: "Payments engineer with 8 years of experience.",
  work: [
    {
      sourceWorkId: "work-acme",
      bullets: [
        { sourceBulletId: "b-oncall", text: "Led payments on-call" },
        {
          sourceBulletId: "b-latency",
          text: "Reduced checkout latency 40% for 1,200 stores",
        },
      ],
    },
  ],
  projects: [],
  skills: [{ category: "languages", items: ["go", "TypeScript"] }],
};

const requirements: ParsedRequirements = {
  mustHave: ["Payments experience"],
  niceToHave: ["Go"],
  techStack: ["Go"],
  responsibilities: [],
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

describe("numbersIn", () => {
  it("treats thousands separators as the same number", () => {
    expect(numbersIn("1,200 and 1\u202f200 and 1200")).toEqual(
      new Set(["1200"]),
    );
    expect(numbersIn("3 5")).toEqual(new Set(["3", "5"]));
    expect(numbersIn("40 % dans 1 200 magasins en 2019")).toEqual(
      new Set(["40", "1200", "2019"]),
    );
  });
});

describe("validateTailoring", () => {
  it("accepts a plan that only reorders, trims and rewords", () => {
    expect(validateTailoring(good, profile)).toEqual([]);
  });

  it("rejects bullets that don't cite a master bullet of the same position", () => {
    const bad = structuredClone(good);
    bad.work[0].bullets.push(
      { sourceBulletId: "made-up", text: "Invented" },
      { sourceBulletId: "b-reports", text: "Moved bullet" },
      { sourceBulletId: "b-oncall", text: "Used twice" },
      { sourceBulletId: "b-cli", text: "" },
    );
    expect(validateTailoringStructure(bad, profile)).toEqual([
      { kind: "unknownBullet", sourceBulletId: "made-up" },
      { kind: "wrongOwner", sourceBulletId: "b-reports" },
      { kind: "duplicateBullet", sourceBulletId: "b-oncall" },
      { kind: "wrongOwner", sourceBulletId: "b-cli" },
      { kind: "emptyBullet", sourceBulletId: "b-cli" },
    ]);
  });

  it("rejects unknown or repeated positions and projects, and invented skills", () => {
    const bad: TailorPlan = {
      ...good,
      work: [
        ...good.work,
        { sourceWorkId: "work-acme", bullets: [] },
        { sourceWorkId: "x", bullets: [] },
      ],
      projects: [{ sourceProjectId: "nope", bullets: [] }],
      skills: [
        { category: "Languages", items: ["Rust"] },
        { category: "Cloud", items: [] },
      ],
    };
    expect(validateTailoringStructure(bad, profile)).toEqual([
      { kind: "duplicateWork", sourceWorkId: "work-acme" },
      { kind: "unknownWork", sourceWorkId: "x" },
      { kind: "unknownProject", sourceProjectId: "nope" },
      { kind: "unknownSkill", category: "Languages", item: "Rust" },
      { kind: "unknownSkill", category: "Cloud" },
    ]);
  });

  it("rejects new numbers in bullets or the summary, and an empty plan", () => {
    const bad = structuredClone(good);
    bad.work[0].bullets[1].text = "Cut checkout latency by 60%";
    bad.summary = "Engineer with 10 years.";
    expect(validateTailoring(bad, profile)).toEqual([
      { kind: "newNumber", where: "bullet", sourceBulletId: "b-latency" },
      { kind: "newNumber", where: "summary" },
    ]);
    expect(
      validateTailoring({ work: [], projects: [], skills: [] }, profile),
    ).toEqual([{ kind: "empty" }]);
  });

  it("rejects a summary when the profile has none", () => {
    const noSummary = { ...profile, basics: { name: "Ada" } };
    expect(validateTailoringStructure(good, noSummary)).toContainEqual({
      kind: "summaryWithoutSource",
    });
  });
});

describe("assembleResume", () => {
  it("copies everything but the chosen text from the master profile, in profile order", () => {
    const plan: TailorPlan = {
      ...good,
      work: [
        {
          sourceWorkId: "work-initech",
          bullets: [{ sourceBulletId: "b-reports", text: " TPS tooling " }],
        },
        good.work[0],
      ],
    };
    const resume = assembleResume(plan, profile);
    expect(resume.basics).toEqual({ ...profile.basics, summary: good.summary });
    expect(resume.work.map((w) => w.sourceWorkId)).toEqual([
      "work-acme",
      "work-initech",
    ]);
    expect(resume.work[1]).toEqual({
      sourceWorkId: "work-initech",
      company: "Initech",
      position: "Engineer",
      startDate: "2016-01",
      endDate: "2018-12",
      bullets: [{ sourceBulletId: "b-reports", text: "TPS tooling" }],
    });
    expect(resume.skills).toEqual([
      { category: "Languages", items: ["Go", "TypeScript"] },
    ]);
    expect(resume.education).toEqual(profile.education);
    expect(resume.projects).toBeUndefined();
  });
});

describe("draft", () => {
  it("round-trips a plan and drops positions the user left out", () => {
    const draft = toDraft(good);
    expect(toPlan(draft, profile)).toEqual(good);
    const rest = { ...draft.entries };
    delete rest["work:work-acme"];
    rest["project:proj-cli"] = [
      { sourceBulletId: "b-cli", text: "Wrote a CLI in Go" },
    ];
    expect(toPlan({ ...draft, entries: rest }, profile)).toMatchObject({
      work: [],
      projects: [{ sourceProjectId: "proj-cli" }],
    });
  });
});

describe("tailorResume", () => {
  beforeEach(() => {
    model = new MockLanguageModelV4({ doGenerate: async () => reply(good) });
  });

  it("returns the plan, the assembled resume and the metadata to store", async () => {
    const result = await tailorResume({
      job: { title: "Payments Engineer", company: "Northwind" },
      requirements,
      profile,
      resumeLanguage: "en",
    });
    expect(result).toMatchObject({
      ok: true,
      model: "test-model",
      promptVersion: "tailor-resume@1",
      attempts: 1,
    });
    const sent = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(sent).toContain("Resume language: en");
    expect(sent).toContain("b-latency: Cut checkout latency");
  });

  it("retries once and then rejects output citing bullets not in the profile", async () => {
    const invalid = structuredClone(good);
    invalid.work[0].bullets[0].sourceBulletId = "hallucinated";
    model = new MockLanguageModelV4({ doGenerate: async () => reply(invalid) });
    const result = await tailorResume({
      job: { title: "T", company: "C" },
      requirements,
      profile,
      resumeLanguage: "en",
    });
    expect(result).toEqual({
      ok: false,
      error: "invalidTailoring",
      problems: [{ kind: "unknownBullet", sourceBulletId: "hallucinated" }],
    });
    expect(model.doGenerateCalls).toHaveLength(2);
  });
});

describe("saveResumeVersion", () => {
  const jobId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    insertResumeVersion.mockClear();
    getJob.mockResolvedValue({ id: jobId });
  });

  it("rebuilds the resume from the current profile and stores the prompt metadata", async () => {
    const { saveResumeVersion } = await import("./actions");
    const result = await saveResumeVersion({
      jobId,
      name: "Northwind",
      plan: good,
    });
    expect(result).toEqual({
      ok: true,
      id: "11111111-1111-4111-8111-111111111111",
    });
    expect(insertResumeVersion).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        jobId,
        isAiGenerated: true,
        model: "test-model",
        promptVersion: "tailor-resume@1",
        language: "en",
        data: expect.objectContaining({
          work: [
            expect.objectContaining({
              company: "Acme",
              position: "Senior Engineer",
            }),
          ],
        }),
      }),
    );
  });

  it("rejects a forged sourceBulletId without storing anything", async () => {
    const { saveResumeVersion } = await import("./actions");
    const forged = structuredClone(good);
    forged.work[0].bullets[0].sourceBulletId = "not-in-profile";
    expect(await saveResumeVersion({ jobId, name: "X", plan: forged })).toEqual(
      {
        ok: false,
        error: "invalidSource",
      },
    );
    expect(insertResumeVersion).not.toHaveBeenCalled();
  });

  it("rejects a job that isn't the user's", async () => {
    getJob.mockResolvedValue(null);
    const { saveResumeVersion } = await import("./actions");
    expect(await saveResumeVersion({ jobId, name: "X", plan: good })).toEqual({
      ok: false,
      error: "notFound",
    });
  });
});

describe("planFromResume", () => {
  it("keeps bullets but drops skills and a summary the profile no longer has", () => {
    const resume = assembleResume(good, profile);
    resume.skills.push({ category: "Cloud", items: ["AWS"] });
    resume.skills[0].items.push("Rust");
    const plan = planFromResume(resume, {
      ...profile,
      basics: { name: "Ada" },
    });
    expect(plan.summary).toBeUndefined();
    expect(plan.work).toEqual(
      resume.work.map((w) => ({
        sourceWorkId: w.sourceWorkId,
        bullets: w.bullets,
      })),
    );
    expect(plan.skills).toEqual([
      { category: "Languages", items: ["Go", "TypeScript"] },
    ]);
  });
});

describe("saveResumeEdits", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => updateResumeVersionData.mockClear());

  it("rebuilds the resume from the current profile and saves it", async () => {
    const { saveResumeEdits } = await import("./actions");
    expect(await saveResumeEdits({ id, plan: good })).toEqual({ ok: true });
    expect(updateResumeVersionData).toHaveBeenCalledWith(
      "user-1",
      id,
      expect.objectContaining({
        work: [
          expect.objectContaining({
            company: "Acme",
            position: "Senior Engineer",
          }),
        ],
      }),
    );
  });

  it("reports a locked version and rejects a forged source", async () => {
    const { saveResumeEdits } = await import("./actions");
    updateResumeVersionData.mockResolvedValueOnce("locked");
    expect(await saveResumeEdits({ id, plan: good })).toEqual({
      ok: false,
      error: "locked",
    });

    const forged = structuredClone(good);
    forged.work[0].bullets[0].sourceBulletId = "not-in-profile";
    updateResumeVersionData.mockClear();
    expect(await saveResumeEdits({ id, plan: forged })).toEqual({
      ok: false,
      error: "invalidSource",
    });
    expect(updateResumeVersionData).not.toHaveBeenCalled();
  });

  it("refuses to rebuild a translation from a profile in another language", async () => {
    const { saveResumeEdits } = await import("./actions");
    updateResumeVersionData.mockClear();
    getResumeVersion.mockResolvedValueOnce({
      name: "Northwind (French)",
      language: "fr",
    });
    expect(await saveResumeEdits({ id, plan: good })).toEqual({
      ok: false,
      error: "otherLanguage",
    });
    expect(updateResumeVersionData).not.toHaveBeenCalled();
  });
});

describe("duplicateResumeVersion", () => {
  it("copies the version under a translated name", async () => {
    const { duplicateResumeVersion: duplicate } = await import("./actions");
    const id = "11111111-1111-4111-8111-111111111111";
    expect(await duplicate(id)).toEqual({
      ok: true,
      id: "33333333-3333-4333-8333-333333333333",
    });
    expect(duplicateResumeVersion).toHaveBeenCalledWith(
      "user-1",
      id,
      "Northwind (copy)",
    );
    getResumeVersion.mockResolvedValueOnce(null);
    expect(await duplicate(id)).toEqual({ ok: false, error: "notFound" });
  });
});
