import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { profileBullets } from "@/prompts/fit-analysis";
import { profileDataSchema } from "@/prompts/schemas";
import { CASES } from "../cases";
import { checkFit, checkParse, inRange } from "./checks";
import { detectLanguage } from "./language";

describe("detectLanguage", () => {
  it("tells English from French", () => {
    expect(
      detectLanguage(
        "The candidate has strong experience with the main stack, but there is no evidence of Terraform.",
      ),
    ).toBe("en");
    expect(
      detectLanguage(
        "La candidate possède une solide expérience de la pile principale, mais rien ne démontre l'usage de Terraform.",
      ),
    ).toBe("fr");
  });

  it("refuses to decide on short or mixed text", () => {
    expect(detectLanguage("React, TypeScript, GraphQL")).toBe("unknown");
    expect(
      detectLanguage("the and of to with — le la les des et pour"),
    ).toBe("unknown");
  });
});

describe("checks", () => {
  const analysis = {
    summary: "The profile meets most of the requirements of the role.",
    matched: [
      { requirementId: "must:0", requirement: "Java and Spring", evidenceBulletIds: ["w1b2"] },
      { requirementId: "must:1", requirement: "PostgreSQL", evidenceBulletIds: ["w1b3", "made-up"] },
    ],
    gaps: [
      {
        requirementId: "nice:0",
        requirement: "Experience with the PHP language",
        severity: "minor" as const,
        suggestion: "Point to the JavaScript work and say that you are learning PHP.",
      },
    ],
  };
  const bulletIds = new Set(["w1b2", "w1b3"]);

  it("flags unknown evidence ids, out-of-range scores and retries", () => {
    const checks = checkFit({
      analysis,
      score: 90,
      attempts: 2,
      range: [0, 35],
      bulletIds,
      outputLanguage: "en",
    });
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
    expect(byName.score.pass).toBe(false);
    expect(byName.evidence).toMatchObject({ pass: false, detail: "unknown ids: made-up" });
    expect(byName.firstTry.pass).toBe(false);
    expect(byName.language.pass).toBe(true);
  });

  it("fails the language check when the explanation is in the wrong language", () => {
    const [, , , language] = checkFit({
      analysis,
      score: 20,
      attempts: 1,
      range: [0, 35],
      bulletIds,
      outputLanguage: "fr",
    });
    expect(language).toMatchObject({ name: "language", pass: false });
  });

  it("checks the parsed language and that requirements were found", () => {
    expect(
      checkParse({ detected: "fr", expected: "en", requirementCount: 0 }).map((c) => c.pass),
    ).toEqual([false, false]);
    expect(inRange(35, [0, 35])).toBe(true);
    expect(inRange(36, [0, 35])).toBe(false);
  });
});

describe("fixtures", () => {
  const root = join(process.cwd(), "evals", "fixtures");
  const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), "utf8"));

  it("has valid profiles with unique bullet ids", () => {
    for (const file of readdirSync(join(root, "profiles"))) {
      const profile = profileDataSchema.parse(read(`profiles/${file}`));
      const ids = profileBullets(profile).map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("has a posting file for every case, and unique case ids", () => {
    const postings = new Set(
      readdirSync(join(root, "postings")).map((f) => f.replace(/\.json$/, "")),
    );
    for (const c of CASES) expect(postings).toContain(c.posting);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });
});
