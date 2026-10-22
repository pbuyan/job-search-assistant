// Pure helpers for the tailoring review screen, kept free of server imports.
// The draft keys each included position/project as "work:<id>" or
// "project:<id>", so the screen edits one flat map; toPlan() turns it back
// into a plan in the master profile's order.
import type { ProfileData, TailoredBullet } from "@/db/schema";
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
      .map((p) => ({ sourceProjectId: p.id, bullets: pick(`project:${p.id}`) })),
    skills: draft.skills,
  };
}

export const hasEmptyBullet = (draft: Draft) =>
  Object.values(draft.entries).some((bullets) =>
    bullets.some((b) => !b.text.trim()),
  );
