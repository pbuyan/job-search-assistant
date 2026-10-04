import type { ProfileDataInput } from "@/prompts/schemas";

export const BASICS_FIELDS = ["name", "label", "email", "phone", "location", "summary"] as const;
export type BasicsField = (typeof BASICS_FIELDS)[number];
export const COUNTED_SECTIONS = ["work", "bullets", "education", "skills"] as const;
export type CountedSection = (typeof COUNTED_SECTIONS)[number];

export type ProfileDiff = {
  /** The current profile has content that accepting the import replaces. */
  replacesExisting: boolean;
  changedBasics: BasicsField[];
  counts: Record<CountedSection, { before: number; after: number }>;
};

const countsOf = (d: ProfileDataInput): Record<CountedSection, number> => ({
  work: d.work.length,
  bullets: d.work.reduce((n, w) => n + w.bullets.length, 0),
  education: d.education?.length ?? 0,
  skills: d.skills.length,
});

// A summary of what accepting an AI proposal would change, shown next to the
// form so the user confirms with the consequences in view. The full values
// are in the form itself.
export function diffProfiles(before: ProfileDataInput, after: ProfileDataInput): ProfileDiff {
  const b = countsOf(before);
  const a = countsOf(after);
  const counts = Object.fromEntries(
    COUNTED_SECTIONS.map((s) => [s, { before: b[s], after: a[s] }]),
  ) as ProfileDiff["counts"];
  const changedBasics = BASICS_FIELDS.filter(
    (f) => (before.basics[f] ?? "") !== (after.basics[f] ?? ""),
  );
  const replacesExisting =
    BASICS_FIELDS.some((f) => (before.basics[f] ?? "") !== "") ||
    COUNTED_SECTIONS.some((s) => b[s] > 0);
  return { replacesExisting, changedBasics, counts };
}
