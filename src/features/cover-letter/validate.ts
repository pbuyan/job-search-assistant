import type { ProfileData } from "@/db/schema";
import { numbersIn } from "@/features/tailoring/validate-tailoring";
import type { CoverLetterDraft } from "@/prompts/cover-letter";
import { profileBullets } from "@/prompts/fit-analysis";

export type CoverLetterProblem =
  | { kind: "unknownBullet"; paragraph: number; sourceBulletId: string }
  | { kind: "newNumber"; paragraph: number }
  | { kind: "placeholder"; paragraph: number }
  | { kind: "emptyParagraph"; paragraph: number }
  | { kind: "noEvidence" }
  | { kind: "length"; paragraphs: number };

export const MIN_PARAGRAPHS = 2;
export const MAX_PARAGRAPHS = 6;

// Checks the draft against the profile: every cited id is a real bullet, a
// paragraph only uses numbers its cited bullets state (or that appear in the
// job's title and company, e.g. "Level 3"), at least one paragraph rests on
// evidence, and nothing is left as a template placeholder. Problems carry
// indexes and ids only, never text (PII).
export function validateCoverLetter(
  draft: CoverLetterDraft,
  profile: ProfileData,
  job: { title: string; company: string },
): CoverLetterProblem[] {
  const problems: CoverLetterProblem[] = [];
  const bullets = new Map(profileBullets(profile).map((b) => [b.id, b.text]));
  const jobNumbers = numbersIn(`${job.title} ${job.company}`);
  const count = draft.paragraphs.length;
  if (count < MIN_PARAGRAPHS || count > MAX_PARAGRAPHS)
    problems.push({ kind: "length", paragraphs: count });

  draft.paragraphs.forEach((p, paragraph) => {
    if (!p.text.trim()) problems.push({ kind: "emptyParagraph", paragraph });
    if (/\[[^\]]*\]|\{[^}]*\}/.test(p.text))
      problems.push({ kind: "placeholder", paragraph });
    const allowed = new Set(jobNumbers);
    for (const id of p.sourceBulletIds) {
      const text = bullets.get(id);
      if (text === undefined) {
        problems.push({ kind: "unknownBullet", paragraph, sourceBulletId: id });
        continue;
      }
      for (const n of numbersIn(text)) allowed.add(n);
    }
    if ([...numbersIn(p.text)].some((n) => !allowed.has(n)))
      problems.push({ kind: "newNumber", paragraph });
  });

  if (
    !draft.paragraphs.some((p) =>
      p.sourceBulletIds.some((id) => bullets.has(id)),
    )
  )
    problems.push({ kind: "noEvidence" });
  return problems;
}

// The letter as the user sees and edits it: paragraphs separated by a blank
// line.
export const coverLetterText = (draft: CoverLetterDraft) =>
  draft.paragraphs.map((p) => p.text.trim()).join("\n\n");
