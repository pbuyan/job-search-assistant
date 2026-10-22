// @vitest-environment node
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TailoredResume } from "@/db/schema";
import { mergeTranslation, validateTranslation } from "./merge";
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

// What a good model answer looks like, including fields it must not change
// (company, name, email, dates) changed anyway, to prove they're ignored.
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

describe("validateTranslation", () => {
  it("accepts a translation that lines up and keeps every number", () => {
    expect(validateTranslation(source, translated)).toEqual([]);
  });

  it("rejects dropped or reordered bullets and lost numbers or text", () => {
    const bad = structuredClone(translated);
    bad.work[0].bullets.reverse();
    expect(validateTranslation(source, bad)).toEqual([
      { kind: "shape", path: "work.0.bullets.0" },
      { kind: "shape", path: "work.0.bullets.1" },
    ]);

    const lost = structuredClone(translated);
    lost.work[0].bullets[0].text = "A réduit la latence de moitié.";
    lost.basics.summary = "";
    lost.skills[0].items.pop();
    expect(validateTranslation(source, lost)).toEqual([
      { kind: "empty", path: "basics.summary" },
      { kind: "numbers", path: "work.0.bullets.0" },
      { kind: "shape", path: "skills" },
    ]);

    const dropped = structuredClone(translated);
    dropped.work[0].bullets.pop();
    expect(validateTranslation(source, dropped)).toEqual([
      { kind: "shape", path: "work.0" },
    ]);
  });
});

describe("mergeTranslation", () => {
  it("takes only translatable text and keeps names, employers, dates and ids", () => {
    const merged = mergeTranslation(source, translated);
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
  });

  it("keeps the source text where the model left a field blank", () => {
    const blank = structuredClone(translated);
    blank.skills[0].items[1] = " ";
    expect(mergeTranslation(source, blank).skills[0].items[1]).toBe(
      "Project management",
    );
  });
});

describe("translateResume", () => {
  beforeEach(() => {
    model = new MockLanguageModelV4({
      doGenerate: async () => reply(translated),
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
      promptVersion: "translate-resume@1",
      attempts: 1,
    });
    const sent = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(sent).toContain("Source language: en");
    expect(sent).toContain("Target language: fr");
  });

  it("retries once, then rejects a translation that doesn't line up", async () => {
    const bad = structuredClone(translated);
    bad.work[0].bullets.pop();
    model = new MockLanguageModelV4({ doGenerate: async () => reply(bad) });
    const result = await translateResume({
      resume: source,
      sourceLanguage: "en",
      targetLanguage: "fr",
    });
    expect(result).toEqual({
      ok: false,
      error: "invalidTranslation",
      problems: [{ kind: "shape", path: "work.0" }],
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

describe("translateResumeVersion", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  beforeEach(() => {
    model = new MockLanguageModelV4({
      doGenerate: async () => reply(translated),
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
        promptVersion: "translate-resume@1",
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
});
