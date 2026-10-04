// @vitest-environment node
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PARSE_RESUME_SYSTEM, PROMPT_VERSION } from "@/prompts/parse-resume";
import { diffProfiles } from "./diff";
import { parseResume } from "./parse-resume";

let model: MockLanguageModelV4;
vi.mock("@/lib/ai/models", () => ({ parseResumeModel: () => model }));

const reply = (object: unknown): ConstructorParameters<typeof MockLanguageModelV4>[0] => ({
  doGenerate: async () => ({
    content: [{ type: "text", text: JSON.stringify(object) }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 10, text: 10, reasoning: 0 },
    },
    warnings: [],
  }),
});

// What a model might return: made-up "valid-looking" ids, plus sections the
// form can't show.
const modelOutput = {
  language: "FR",
  data: {
    basics: {
      name: "Marie Tremblay",
      label: "Développeuse logicielle",
      links: [{ label: "site", url: "https://example.com" }],
    },
    work: [
      {
        id: "model-made-id-1",
        company: "Boréale Inc.",
        position: "Développeuse senior",
        startDate: "2020-01",
        bullets: [
          { id: "model-made-bullet-1", text: "Conçu une API de facturation", skills: ["api"] },
        ],
      },
    ],
    projects: [{ id: "p1", name: "Projet", bullets: [] }],
    education: [{ institution: "Université de Montréal" }],
    skills: [{ category: "Langages", items: ["TypeScript"] }],
    certifications: [{ name: "Cert" }],
    languages: [{ language: "Français" }],
  },
};

describe("parseResume", () => {
  beforeEach(() => {
    model = new MockLanguageModelV4(reply(modelOutput));
  });

  it("returns reviewable data with fresh ids and the detected language", async () => {
    const result = await parseResume("Marie Tremblay — texte du CV");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.language).toBe("fr");
    expect(result.promptVersion).toBe(PROMPT_VERSION);

    const [job] = result.data.work;
    expect(job.company).toBe("Boréale Inc."); // original language, untouched
    expect(job.id).not.toBe("model-made-id-1");
    expect(job.id).toMatch(/^[\w-]{8,64}$/);
    expect(job.bullets[0].id).not.toBe("model-made-bullet-1");
    expect(job.bullets[0].text).toBe("Conçu une API de facturation");
    expect(job.bullets[0]).not.toHaveProperty("skills");

    // Sections the form can't show are dropped, not saved unseen.
    expect(result.data).not.toHaveProperty("projects");
    expect(result.data).not.toHaveProperty("certifications");
    expect(result.data).not.toHaveProperty("languages");
    expect(result.data.basics.links).toBeUndefined();
  });

  it("sends the resume as delimited data with the versioned system prompt", async () => {
    await parseResume("RESUME-BODY");
    const call = model.doGenerateCalls[0];
    const sent = JSON.stringify(call.prompt);
    expect(sent).toContain("<resume>");
    expect(sent).toContain("RESUME-BODY");
    expect(sent).toContain(PARSE_RESUME_SYSTEM.slice(0, 40));
  });

  it("reports failures as codes without echoing resume text", async () => {
    model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("boom: SECRET-RESUME-TEXT");
      },
    });
    const result = await parseResume("SECRET-RESUME-TEXT");
    expect(result).toEqual({ ok: false, error: "parseFailed" });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("reports nothing extracted", async () => {
    model = new MockLanguageModelV4(
      reply({ language: "en", data: { basics: { name: "" }, work: [], skills: [] } }),
    );
    expect(await parseResume("lorem ipsum")).toEqual({ ok: false, error: "noContent" });
  });
});

describe("diffProfiles", () => {
  const empty = { basics: { name: "" }, work: [], education: [], skills: [] };
  const filled = {
    basics: { name: "Ada", email: "ada@example.com" },
    work: [
      { id: "w1", company: "A", position: "P", startDate: "2020", bullets: [{ id: "b1", text: "t" }] },
    ],
    education: [],
    skills: [{ category: "c", items: [] }],
  };

  it("does not flag an empty profile as replaced", () => {
    expect(diffProfiles(empty, filled).replacesExisting).toBe(false);
  });

  it("lists changed basics and section counts when replacing", () => {
    const diff = diffProfiles(filled, { ...filled, basics: { name: "Ada", email: "b@example.com" }, work: [] });
    expect(diff.replacesExisting).toBe(true);
    expect(diff.changedBasics).toEqual(["email"]);
    expect(diff.counts.work).toEqual({ before: 1, after: 0 });
    expect(diff.counts.bullets).toEqual({ before: 1, after: 0 });
  });
});
