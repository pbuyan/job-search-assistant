import type { FitAnalysisOutput, RequirementRef } from "@/prompts/fit-analysis";

export type FitProblem =
  | { kind: "noEvidence"; requirementId: string }
  | { kind: "unknownBullet"; requirementId: string; bulletId: string }
  | { kind: "unknownRequirement"; requirementId: string }
  | { kind: "duplicateRequirement"; requirementId: string }
  | { kind: "uncoveredRequirement"; requirementId: string };

// Enforced in code, not just asked for in the prompt: every matched
// requirement cites at least one bullet that exists in the master profile,
// and every requirement is classified exactly once. Any problem rejects the
// whole output.
export function validateFit(
  output: FitAnalysisOutput,
  requirements: RequirementRef[],
  bulletIds: ReadonlySet<string>,
): FitProblem[] {
  const problems: FitProblem[] = [];
  const known = new Set(requirements.map((r) => r.id));
  const seen = new Set<string>();

  const visit = (requirementId: string) => {
    if (!known.has(requirementId))
      problems.push({ kind: "unknownRequirement", requirementId });
    else if (seen.has(requirementId))
      problems.push({ kind: "duplicateRequirement", requirementId });
    seen.add(requirementId);
  };

  for (const m of output.matched) {
    visit(m.requirementId);
    if (m.evidenceBulletIds.length === 0) {
      problems.push({ kind: "noEvidence", requirementId: m.requirementId });
    }
    for (const bulletId of m.evidenceBulletIds) {
      if (!bulletIds.has(bulletId)) {
        problems.push({
          kind: "unknownBullet",
          requirementId: m.requirementId,
          bulletId,
        });
      }
    }
  }
  for (const g of output.gaps) visit(g.requirementId);
  for (const id of known) {
    if (!seen.has(id))
      problems.push({ kind: "uncoveredRequirement", requirementId: id });
  }
  return problems;
}
