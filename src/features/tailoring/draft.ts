// Pure helpers for the tailoring review and edit screens, kept free of server
// imports.
// The draft keys each included position/project as "work:<id>" or
// "project:<id>", so the screen edits one flat map; toPlan() turns it back
// into a plan in the master profile's order.
import type { ProfileData, TailoredBullet, TailoredResume } from "@/db/schema";
import type { TailorPlan } from "@/prompts/tailor-resume";

export type Draft = {
  summary?: string;
  entries: Record<string, TailoredBullet[]>;
  skills: TailorPlan["skills"];
};

export type MasterEntry = {
  key: string;
  group: "work" | "projects";
  title: string;
  company?: string;
  startDate?: string;
  endDate?: string;
  bullets: { id: string; text: string }[];
};

export function masterEntries(profile: ProfileData): MasterEntry[] {
  return [
    ...profile.work.map((w) => ({
      key: `work:${w.id}`,
      group: "work" as const,
      title: w.position,
      company: w.company,
      startDate: w.startDate,
      endDate: w.endDate,
      bullets: w.bullets,
    })),
    ...(profile.projects ?? []).map((p) => ({
      key: `project:${p.id}`,
      group: "projects" as const,
      title: p.name,
      bullets: p.bullets,
    })),
  ];
}

export function toDraft(plan: TailorPlan): Draft {
  return {
    ...(plan.summary !== undefined ? { summary: plan.summary } : {}),
    entries: Object.fromEntries([
      ...plan.work.map((w) => [`work:${w.sourceWorkId}`, w.bullets]),
      ...plan.projects.map((p) => [`project:${p.sourceProjectId}`, p.bullets]),
    ]),
    skills: plan.skills,
  };
}

export function toPlan(draft: Draft, profile: ProfileData): TailorPlan {
  const pick = (key: string) =>
    (draft.entries[key] ?? []).map((b) => ({ ...b, text: b.text.trim() }));
  return {
    ...(draft.summary?.trim() ? { summary: draft.summary.trim() } : {}),
    work: profile.work
      .filter((w) => `work:${w.id}` in draft.entries)
      .map((w) => ({ sourceWorkId: w.id, bullets: pick(`work:${w.id}`) })),
    projects: (profile.projects ?? [])
      .filter((p) => `project:${p.id}` in draft.entries)
      .map((p) => ({
        sourceProjectId: p.id,
        bullets: pick(`project:${p.id}`),
      })),
    skills: draft.skills,
  };
}

export const hasEmptyBullet = (draft: Draft) =>
  Object.values(draft.entries).some((bullets) =>
    bullets.some((b) => !b.text.trim()),
  );

export const hasNoBullets = (draft: Draft) =>
  Object.values(draft.entries).every((bullets) => bullets.length === 0);

const key = (s: string) => s.trim().toLowerCase();

// A saved version's editable choices as a plan. Skills and the summary that
// the profile no longer has are dropped, since saving checks them against
// the current profile; bullets are kept as they are, so a version citing a
// deleted achievement shows up as stale instead of silently losing it.
export function planFromResume(
  resume: TailoredResume,
  profile: ProfileData,
): TailorPlan {
  const master = new Map(
    profile.skills.map((s) => [key(s.category), new Set(s.items.map(key))]),
  );
  const skills = resume.skills.flatMap((s) => {
    const items = master.get(key(s.category));
    if (!items) return [];
    return [
      { category: s.category, items: s.items.filter((i) => items.has(key(i))) },
    ];
  });
  return {
    ...(resume.basics.summary && profile.basics.summary?.trim()
      ? { summary: resume.basics.summary }
      : {}),
    work: resume.work.map((w) => ({
      sourceWorkId: w.sourceWorkId,
      bullets: w.bullets,
    })),
    projects: (resume.projects ?? []).map((p) => ({
      sourceProjectId: p.sourceProjectId,
      bullets: p.bullets,
    })),
    skills,
  };
}
