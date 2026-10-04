// @vitest-environment node
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedRequirements, ProfileData } from "@/db/schema";
import {
  requirementRefs,
  type FitAnalysisOutput,
} from "@/prompts/fit-analysis";
import { analyzeFit } from "./analyze-fit";
import { computeScore } from "./score";
import { validateFit } from "./validate-fit";

let model: MockLanguageModelV4;
vi.mock("@/lib/ai/models", () => ({
  fitAnalysisModel: () => model,
  MODEL_IDS: { fitAnalysis: "test-model" },
}));

const requirements: ParsedRequirements = {
  mustHave: ["5+ ans en TypeScript", "Expérience avec PostgreSQL"],
  niceToHave: ["Connaissance de Kubernetes"],
  techStack: [],
  responsibilities: [],
};
const refs = requirementRefs(requirements);

const profile: ProfileData = {
  basics: { name: "Ada" },
  work: [
    {
      id: "work-0001",
      company: "Acme",
      position: "Engineer",
      startDate: "2018",
      bullets: [
        { id: "b-typescript", text: "Built a TypeScript API" },
        { id: "b-postgres", text: "Tuned PostgreSQL queries" },
      ],
    },
  ],
  skills: [{ category: "Tools", items: ["Kubernetes"] }],
};
const bulletIds = new Set(["b-typescript", "b-postgres"]);

const good: FitAnalysisOutput = {
  summary: "Strong match.",
  matched: [
    {
      requirementId: "must:0",
      requirement: "5+ years TypeScript",
      evidenceBulletIds: ["b-typescript"],
    },
    {
      requirementId: "must:1",
      requirement: "PostgreSQL",
      evidenceBulletIds: ["b-postgres"],
    },
  ],
  gaps: [
    {
      requirementId: "nice:0",
      requirement: "Kubernetes",
      severity: "minor",
      suggestion: "Mention it.",
    },
  ],
  keywordsToEmphasize: ["TypeScript"],
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

describe("computeScore", () => {
  it("weights must-haves 3:1 over nice-to-haves and gives minor gaps half credit", () => {
    // musts: 3 + 3 matched, nice: 1 × 0.5 → 6.5 / 7
    expect(computeScore(refs, good)).toBe(93);
  });
  it("is 0 when everything is a major gap and 100 when all matched", () => {
    const allMajor = {
      matched: [],
      gaps: refs.map((r) => ({
        requirementId: r.id,
        requirement: r.text,
        severity: "major" as const,
      })),
    };
    expect(computeScore(refs, allMajor)).toBe(0);
    const allMatched = {
      matched: refs.map((r) => ({
        requirementId: r.id,
        requirement: r.text,
        evidenceBulletIds: ["b-typescript"],
      })),
      gaps: [],
    };
    expect(computeScore(refs, allMatched)).toBe(100);
  });
});

describe("validateFit", () => {
  it("accepts a complete analysis with real evidence", () => {
    expect(validateFit(good, refs, bulletIds)).toEqual([]);
  });

  it("rejects matches without evidence or citing bullets not in the profile", () => {
    const bad = structuredClone(good);
    bad.matched[0].evidenceBulletIds = [];
    bad.matched[1].evidenceBulletIds = ["b-postgres", "made-up-id"];
    expect(validateFit(bad, refs, bulletIds)).toEqual([
      { kind: "noEvidence", requirementId: "must:0" },
      {
        kind: "unknownBullet",
        requirementId: "must:1",
        bulletId: "made-up-id",
      },
    ]);
  });

  it("rejects unknown, duplicated and uncovered requirements", () => {
    const bad = structuredClone(good);
    bad.gaps = [
      { requirementId: "must:0", requirement: "dup", severity: "major" },
      { requirementId: "must:9", requirement: "?", severity: "major" },
    ];
    expect(validateFit(bad, refs, bulletIds)).toEqual([
      { kind: "duplicateRequirement", requirementId: "must:0" },
      { kind: "unknownRequirement", requirementId: "must:9" },
      { kind: "uncoveredRequirement", requirementId: "nice:0" },
    ]);
  });
});

describe("analyzeFit", () => {
  beforeEach(() => {
    model = new MockLanguageModelV4({ doGenerate: async () => reply(good) });
  });

  it("returns the analysis, the computed score and the metadata to store", async () => {
    const result = await analyzeFit({
      requirements,
      profile,
      outputLanguage: "fr",
    });
    expect(result).toMatchObject({
      ok: true,
      score: 93,
      model: "test-model",
      promptVersion: "fit-analysis@1",
      analysisLanguage: "fr",
    });
  });

  it("passes the output language and ids to the model as parameters", async () => {
    await analyzeFit({ requirements, profile, outputLanguage: "fr" });
    const sent = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(sent).toContain("Output language: fr");
    expect(sent).toContain("must:0 (required): 5+ ans en TypeScript");
    expect(sent).toContain(
      "b-postgres [Engineer, Acme]: Tuned PostgreSQL queries",
    );
  });

  it("retries once after an invalid citation, then accepts a valid answer", async () => {
    const invalid = structuredClone(good);
    invalid.matched[0].evidenceBulletIds = ["hallucinated"];
    model = new MockLanguageModelV4({
      doGenerate: [reply(invalid), reply(good)],
    });
    const result = await analyzeFit({
      requirements,
      profile,
      outputLanguage: "en",
    });
    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("rejects when every attempt cites evidence that isn't in the profile", async () => {
    const invalid = structuredClone(good);
    invalid.matched[0].evidenceBulletIds = ["hallucinated"];
    model = new MockLanguageModelV4({ doGenerate: async () => reply(invalid) });
    const result = await analyzeFit({
      requirements,
      profile,
      outputLanguage: "en",
    });
    expect(result).toEqual({
      ok: false,
      error: "invalidAnalysis",
      problems: [
        {
          kind: "unknownBullet",
          requirementId: invalid.matched[0].requirementId,
          bulletId: "hallucinated",
        },
      ],
    });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("refuses to run without profile bullets or requirements", async () => {
    const noBullets = { ...profile, work: [] };
    expect(
      await analyzeFit({
        requirements,
        profile: noBullets,
        outputLanguage: "en",
      }),
    ).toEqual({
      ok: false,
      error: "noProfileBullets",
    });
    const none = { ...requirements, mustHave: [], niceToHave: [] };
    expect(
      await analyzeFit({ requirements: none, profile, outputLanguage: "en" }),
    ).toEqual({
      ok: false,
      error: "noRequirements",
    });
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});
