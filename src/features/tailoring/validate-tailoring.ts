import type { ProfileData } from "@/db/schema";
import type { TailorPlan } from "@/prompts/tailor-resume";

export type TailoringProblem =
  | { kind: "unknownWork"; sourceWorkId: string }
  | { kind: "duplicateWork"; sourceWorkId: string }
  | { kind: "unknownProject"; sourceProjectId: string }
  | { kind: "duplicateProject"; sourceProjectId: string }
  | { kind: "unknownBullet"; sourceBulletId: string }
  | { kind: "duplicateBullet"; sourceBulletId: string }
  | { kind: "wrongOwner"; sourceBulletId: string }
  | { kind: "emptyBullet"; sourceBulletId: string }
  | { kind: "unknownSkill"; category: string; item?: string }
  | { kind: "summaryWithoutSource" }
  | { kind: "newNumber"; where: "summary" | "bullet"; sourceBulletId?: string }
  | { kind: "empty" };

const key = (s: string) => s.trim().toLowerCase();

// Numbers as written, with thousands separators dropped so "1,200", "1 200"
// (French, narrow no-break space) and "1200" compare equal. Plain spaces are
// not separators: "3 5" is two numbers.
const NUMBER = /\d(?:[\d.,\u00a0\u202f]*\d)?/g;
export function numbersIn(text: string): Set<string> {
  return new Set(
    (text.match(NUMBER) ?? []).map((n) => n.replace(/[.,\u00a0\u202f]/g, "")),
  );
}

// Owner of every master bullet: "work:<id>" or "project:<id>".
function bulletOwners(profile: ProfileData) {
  const owners = new Map<string, { owner: string; text: string }>();
  for (const w of profile.work)
    for (const b of w.bullets) owners.set(b.id, { owner: `work:${w.id}`, text: b.text });
  for (const p of profile.projects ?? [])
    for (const b of p.bullets)
      owners.set(b.id, { owner: `project:${p.id}`, text: b.text });
  return owners;
}

// Checks that the plan only cites the master profile: every bullet resolves
// to a master bullet under the same position/project, nothing is used twice,
// and skills come from the profile's own lists. This also runs on save,
// where the text may carry the user's own edits.
export function validateTailoringStructure(
  plan: TailorPlan,
  profile: ProfileData,
): TailoringProblem[] {
  const problems: TailoringProblem[] = [];
  const owners = bulletOwners(profile);
  const workIds = new Set(profile.work.map((w) => w.id));
  const projectIds = new Set((profile.projects ?? []).map((p) => p.id));
  const usedBullets = new Set<string>();

  const visitBullets = (
    owner: string,
    bullets: TailorPlan["work"][number]["bullets"],
  ) => {
    for (const b of bullets) {
      const source = owners.get(b.sourceBulletId);
      if (!source) {
        problems.push({ kind: "unknownBullet", sourceBulletId: b.sourceBulletId });
      } else if (source.owner !== owner) {
        problems.push({ kind: "wrongOwner", sourceBulletId: b.sourceBulletId });
      }
      if (usedBullets.has(b.sourceBulletId)) {
        problems.push({ kind: "duplicateBullet", sourceBulletId: b.sourceBulletId });
      }
      usedBullets.add(b.sourceBulletId);
      if (!b.text.trim()) {
        problems.push({ kind: "emptyBullet", sourceBulletId: b.sourceBulletId });
      }
    }
  };

  const seenWork = new Set<string>();
  for (const w of plan.work) {
    if (!workIds.has(w.sourceWorkId))
      problems.push({ kind: "unknownWork", sourceWorkId: w.sourceWorkId });
    else if (seenWork.has(w.sourceWorkId))
      problems.push({ kind: "duplicateWork", sourceWorkId: w.sourceWorkId });
    seenWork.add(w.sourceWorkId);
    visitBullets(`work:${w.sourceWorkId}`, w.bullets);
  }
  const seenProjects = new Set<string>();
  for (const p of plan.projects) {
    if (!projectIds.has(p.sourceProjectId))
      problems.push({ kind: "unknownProject", sourceProjectId: p.sourceProjectId });
    else if (seenProjects.has(p.sourceProjectId))
      problems.push({ kind: "duplicateProject", sourceProjectId: p.sourceProjectId });
    seenProjects.add(p.sourceProjectId);
    visitBullets(`project:${p.sourceProjectId}`, p.bullets);
  }

  const masterSkills = new Map(
    profile.skills.map((s) => [key(s.category), new Set(s.items.map(key))]),
  );
  for (const s of plan.skills) {
    const items = masterSkills.get(key(s.category));
    if (!items) {
      problems.push({ kind: "unknownSkill", category: s.category });
      continue;
    }
    for (const item of s.items) {
      if (!items.has(key(item)))
        problems.push({ kind: "unknownSkill", category: s.category, item });
    }
  }

  if (plan.summary?.trim() && !profile.basics.summary?.trim()) {
    problems.push({ kind: "summaryWithoutSource" });
  }
  if (usedBullets.size === 0) problems.push({ kind: "empty" });
  return problems;
}

// The model's output additionally may not introduce a number its source
// doesn't contain: the cheapest reliable signal of an invented metric. A
// summary may draw on the whole profile.
export function validateTailoring(
  plan: TailorPlan,
  profile: ProfileData,
): TailoringProblem[] {
  const problems = validateTailoringStructure(plan, profile);
  const owners = bulletOwners(profile);
  for (const b of [...plan.work, ...plan.projects].flatMap((e) => e.bullets)) {
    const source = owners.get(b.sourceBulletId);
    if (!source) continue;
    const allowed = numbersIn(source.text);
    if ([...numbersIn(b.text)].some((n) => !allowed.has(n))) {
      problems.push({ kind: "newNumber", where: "bullet", sourceBulletId: b.sourceBulletId });
    }
  }
  if (plan.summary) {
    const allowed = numbersIn(
      [profile.basics.summary ?? "", ...[...owners.values()].map((o) => o.text)].join("\n"),
    );
    if ([...numbersIn(plan.summary)].some((n) => !allowed.has(n))) {
      problems.push({ kind: "newNumber", where: "summary" });
    }
  }
  return problems;
}
