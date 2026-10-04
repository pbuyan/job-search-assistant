import type { FitAnalysis } from "@/db/schema";
import type { RequirementRef } from "@/prompts/fit-analysis";

// The fit score is computed here, not by the model, so the same analysis
// always gives the same score and the score can't disagree with the listed
// matches and gaps.
export const WEIGHTS = { must: 3, nice: 1 } as const;
export const CREDIT = { matched: 1, minor: 0.5, major: 0 } as const;

export function computeScore(
  requirements: RequirementRef[],
  analysis: Pick<FitAnalysis, "matched" | "gaps">,
): number {
  const credit = new Map<string, number>();
  for (const m of analysis.matched) credit.set(m.requirementId, CREDIT.matched);
  for (const g of analysis.gaps)
    credit.set(g.requirementId, CREDIT[g.severity]);

  let earned = 0;
  let total = 0;
  for (const r of requirements) {
    const w = WEIGHTS[r.kind];
    total += w;
    earned += w * (credit.get(r.id) ?? 0);
  }
  return total === 0 ? 0 : Math.round((100 * earned) / total);
}
