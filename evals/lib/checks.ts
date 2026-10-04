import type { FitAnalysis } from "@/db/schema";
import { detectLanguage } from "./language";

export type Language = "en" | "fr";
export type ScoreRange = readonly [min: number, max: number];

export type CheckName =
  | "parseLanguage"
  | "requirements"
  | "score"
  | "evidence"
  | "firstTry"
  | "language";

// `warn` marks a check that could not decide (e.g. text too short to detect
// a language); it is reported but does not fail the case.
export type Check = {
  name: CheckName;
  pass: boolean;
  warn?: boolean;
  detail?: string;
};

export const inRange = (score: number, [min, max]: ScoreRange) =>
  score >= min && score <= max;

export function checkParse(input: {
  detected: string;
  expected: Language;
  requirementCount: number;
}): Check[] {
  return [
    {
      name: "parseLanguage",
      pass: input.detected === input.expected,
      detail: input.detected,
    },
    {
      name: "requirements",
      pass: input.requirementCount > 0,
      detail: String(input.requirementCount),
    },
  ];
}

export function checkFit(input: {
  analysis: Pick<FitAnalysis, "summary" | "matched" | "gaps">;
  score: number;
  attempts: number;
  range: ScoreRange;
  bulletIds: ReadonlySet<string>;
  outputLanguage: Language;
}): Check[] {
  const { analysis, outputLanguage } = input;

  // Re-checked here even though analyzeFit validates it: the eval must not
  // depend on the code it is evaluating.
  const unknown = analysis.matched.flatMap((m) =>
    m.evidenceBulletIds.filter((id) => !input.bulletIds.has(id)),
  );
  const empty = analysis.matched.filter((m) => m.evidenceBulletIds.length === 0);

  return [
    {
      name: "score",
      pass: inRange(input.score, input.range),
      detail: `${input.score} in ${input.range[0]}–${input.range[1]}`,
    },
    {
      name: "evidence",
      pass: unknown.length === 0 && empty.length === 0,
      detail:
        unknown.length > 0
          ? `unknown ids: ${unknown.join(", ")}`
          : empty.length > 0
            ? `no evidence: ${empty.map((m) => m.requirementId).join(", ")}`
            : undefined,
    },
    {
      name: "firstTry",
      pass: input.attempts === 1,
      detail: `${input.attempts} attempt(s)`,
    },
    languageCheck(analysis, outputLanguage),
  ];
}

function languageCheck(
  analysis: Pick<FitAnalysis, "summary" | "matched" | "gaps">,
  expected: Language,
): Check {
  // The summary is judged alone; the short per-requirement texts together.
  const parts = {
    summary: analysis.summary,
    items: [
      ...analysis.matched.map((m) => m.requirement),
      ...analysis.gaps.flatMap((g) => [g.requirement, g.suggestion ?? ""]),
    ].join("\n"),
  };
  const detected = Object.entries(parts).map(
    ([part, text]) => [part, detectLanguage(text)] as const,
  );
  const wrong = detected.filter(([, lang]) => lang !== expected && lang !== "unknown");
  const unsure = detected.filter(([, lang]) => lang === "unknown");
  const detail = detected.map(([part, lang]) => `${part}=${lang}`).join(" ");

  if (wrong.length > 0) return { name: "language", pass: false, detail };
  if (unsure.length > 0)
    return { name: "language", pass: true, warn: true, detail };
  return { name: "language", pass: true, detail };
}
