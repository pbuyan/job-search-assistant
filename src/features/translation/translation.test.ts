// @vitest-environment node
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TailoredResume } from "@/db/schema";
import {
  applyTranslation,
  segmentsOf,
  validateTranslation,
  type Segment,
} from "./merge";
import { translateResume } from "./translate";

let model: MockLanguageModelV4;
vi.mock("@/lib/ai/models", () => ({
  translateResumeModel: () => model,
  MODEL_IDS: { translateResume: "test-model" },
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user-1" }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations:
    async () => (key: string, v: { name: string; language: string }) =>
      key === "name" ? `${v.name} (${v.language})` : key,
}));

const source: TailoredResume = {
  basics: {
    name: "Ada Lovelace",
    label: "Senior Engineer",
    email: "ada@example.com",
    summary: "Engineer with 8 years in payments.",
  },
  work: [
    {
      sourceWorkId: "w1",
      company: "Acme",
      position: "Senior Engineer",
      startDate: "2019-03",
      bullets: [
        {
          sourceBulletId: "b1",
          text: "Cut checkout latency by 40% across 1,200 stores.",
        },
        { sourceBulletId: "b2", text: "Led the on-call rotation." },
      ],
    },
  ],
  education: [
    {
      institution: "University of Toronto",
      studyType: "BSc",
      area: "Computer Science",
    },
  ],
  skills: [
    { category: "Languages", items: ["TypeScript", "Project management"] },
  ],
  languages: [{ language: "English", fluency: "Native" }],
};

// The same resume translated. Only its segments (segmentsOf) are a model
// answer; its company, name, email and dates are deliberately different to
// prove those never come from the translation.
const translated: TailoredResume = {
  basics: {
    name: "Ada L.",
    label: "Ingénieure principale",
    email: "changed@example.com",
    summary: "Ingénieure cumulant 8 ans dans les paiements.",
  },
  work: [
    {
      sourceWorkId: "w1",
      company: "Acmé",
      position: "Ingénieure principale",
      startDate: "2020-01",
      bullets: [
        {
          sourceBulletId: "b1",
          text: "A réduit la latence du paiement de 40 % dans 1 200 magasins.",
        },
        { sourceBulletId: "b2", text: "A dirigé la rotation de garde." },
      ],
    },
  ],
  education: [
    {
      institution: "Université de Toronto",
      studyType: "B. Sc.",
      area: "Informatique",
    },
  ],
  skills: [
    { category: "Langages", items: ["TypeScript", "Gestion de projet"] },
  ],
  languages: [{ language: "Anglais", fluency: "Langue maternelle" }],
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

const good: Segment[] = segmentsOf(translated);
const sourceSegments = segmentsOf(source);
const without = (id: string) => good.filter((g) => g.id !== id);
const replace = (id: string, text: string) =>
  good.map((g) => (g.id === id ? { id, text } : g));

describe("segmentsOf", () => {
  it("lists only translatable text, by path", () => {
    expect(sourceSegments.map((g) => g.id)).toEqual([
      "basics.label",
      "basics.summary",
      "work.0.position",
      "work.0.bullets.0.text",
      "work.0.bullets.1.text",
      "skills.0.category",
      "skills.0.items.0",
      "skills.0.items.1",
      "education.0.studyType",
      "education.0.area",
      "languages.0.language",
      "languages.0.fluency",
    ]);
  });
});

describe("validateTranslation", () => {
  it("accepts every segment translated once with its numbers", () => {
    expect(validateTranslation(sourceSegments, good)).toEqual([]);
    // Order doesn't matter.
    expect(validateTranslation(sourceSegments, [...good].reverse())).toEqual(
      [],
    );
  });

  it("rejects missing, invented, repeated or empty segments and lost numbers", () => {
    expect(
      validateTranslation(sourceSegments, [
        ...without("work.0.bullets.1.text"),
        { id: "projects.0.name", text: "Projet inventé" },
        good[0],
      ]),
    ).toEqual([
      { kind: "unknown", id: "projects.0.name" },
      { kind: "duplicate", id: "basics.label" },
      { kind: "missing", id: "work.0.bullets.1.text" },
    ]);
    expect(
      validateTranslation(
        sourceSegments,
        [
          ...replace("work.0.bullets.0.text", "A réduit la latence de moitié."),
        ].map((g) => (g.id === "basics.summary" ? { ...g, text: " " } : g)),
      ),
    ).toEqual([
      { kind: "empty", id: "basics.summary" },
      { kind: "numbers", id: "work.0.bullets.0.text" },
    ]);
  });
});

describe("applyTranslation", () => {
  it("puts translated text in place and keeps names, employers, dates and ids", () => {
    const merged = applyTranslation(source, good);
    expect(merged.basics).toEqual({
      ...source.basics,
      label: "Ingénieure principale",
      summary: "Ingénieure cumulant 8 ans dans les paiements.",
    });
    expect(merged.work[0]).toEqual({
      ...source.work[0],
      position: "Ingénieure principale",
      bullets: [
        {
          sourceBulletId: "b1",
          text: "A réduit la latence du paiement de 40 % dans 1 200 magasins.",
        },
        { sourceBulletId: "b2", text: "A dirigé la rotation de garde." },
      ],
    });
    expect(merged.education).toEqual([
      {
        institution: "University of Toronto",
        studyType: "B. Sc.",
        area: "Informatique",
      },
    ]);
    expect(merged.skills).toEqual([
      { category: "Langages", items: ["TypeScript", "Gestion de projet"] },
    ]);
    expect(source.work[0].position).toBe("Senior Engineer");
  });

  it("ignores ids that aren't the source's own segments", () => {
    const merged = applyTranslation(source, [
      { id: "basics.email", text: "changed@example.com" },
      { id: "work.0.company", text: "Other" },
    ]);
    expect(merged).toEqual(source);
  });
});

describe("translateResume", () => {
  beforeEach(() => {
    model = new MockLanguageModelV4({
      doGenerate: async () => reply({ segments: good }),
    });
  });

  it("passes both languages and returns the merged resume with metadata", async () => {
    const result = await translateResume({
      resume: source,
      sourceLanguage: "en",
      targetLanguage: "fr",
    });
    expect(result).toMatchObject({
      ok: true,
      model: "test-model",
      promptVersion: "translate-resume@2",
      attempts: 1,
    });
    const sent = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(sent).toContain("Source language: en");
    expect(sent).toContain("Target language: fr");
    // Only segments are sent: no contact details or employers.
    expect(sent).not.toContain("ada@example.com");
    expect(sent).not.toContain("Acme");
  });

  it("retries once, then rejects a translation that doesn't line up", async () => {
    const bad = without("work.0.bullets.1.text");
    model = new MockLanguageModelV4({
      doGenerate: async () => reply({ segments: bad }),
    });
    const result = await translateResume({
      resume: source,
      sourceLanguage: "en",
      targetLanguage: "fr",
    });
    expect(result).toEqual({
      ok: false,
      error: "invalidTranslation",
      problems: [{ kind: "missing", id: "work.0.bullets.1.text" }],
    });
    expect(model.doGenerateCalls).toHaveLength(2);
  });
});

const insertResumeVersion = vi.fn(
  async () => "22222222-2222-4222-8222-222222222222",
);
const getResumeVersion = vi.fn(async () => ({
  id: "11111111-1111-4111-8111-111111111111",
  jobId: null,
  name: "Northwind",
  language: "en",
  data: source,
}));
vi.mock("@/db/queries/resume-versions", () => ({
  insertResumeVersion: (...args: unknown[]) =>
    insertResumeVersion(...(args as [])),
  getResumeVersion: () => getResumeVersion(),
}));

const consumeQuota = vi.fn(async (): Promise<"ok" | "exceeded"> => "ok");
vi.mock("@/db/queries/usage", () => ({
  consumeQuota: (...a: unknown[]) => consumeQuota(...(a as [])),
}));

describe("translateResumeVersion", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  beforeEach(() => {
    model = new MockLanguageModelV4({
      doGenerate: async () => reply({ segments: good }),
    });
    insertResumeVersion.mockClear();
  });

  it("stores a new version in the target language, linked to its source", async () => {
    const { translateResumeVersion } = await import("./actions");
    expect(await translateResumeVersion({ id, targetLanguage: "fr" })).toEqual({
      ok: true,
      id: "22222222-2222-4222-8222-222222222222",
    });
    expect(insertResumeVersion).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        name: "Northwind (French)",
        language: "fr",
        sourceVersionId: id,
        isAiGenerated: true,
        promptVersion: "translate-resume@2",
      }),
    );
  });

  it("refuses the version's own language and unsupported languages", async () => {
    const { translateResumeVersion } = await import("./actions");
    expect(await translateResumeVersion({ id, targetLanguage: "en" })).toEqual({
      ok: false,
      error: "sameLanguage",
    });
    expect(await translateResumeVersion({ id, targetLanguage: "de" })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(insertResumeVersion).not.toHaveBeenCalled();
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("stops before the model call over the daily cap", async () => {
    const { translateResumeVersion } = await import("./actions");
    consumeQuota.mockResolvedValueOnce("exceeded");
    expect(await translateResumeVersion({ id, targetLanguage: "fr" })).toEqual({
      ok: false,
      error: "quotaExceeded",
    });
    expect(consumeQuota).toHaveBeenCalledWith("user-1", "translateResume");
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(insertResumeVersion).not.toHaveBeenCalled();
  });
});
