import type { ProfileData, TailoredResume } from "@/db/schema";
import type { TailorPlan } from "@/prompts/tailor-resume";

const key = (s: string) => s.trim().toLowerCase();

// Builds the tailored resume from a plan that has passed
// validateTailoringStructure. Everything except bullet text, the summary and
// the choice/order of skills is copied from the master profile, and
// positions and projects keep the profile's order.
export function assembleResume(plan: TailorPlan, profile: ProfileData): TailoredResume {
  const workPlans = new Map(plan.work.map((w) => [w.sourceWorkId, w]));
  const projectPlans = new Map(plan.projects.map((p) => [p.sourceProjectId, p]));

  const work = profile.work.flatMap((w) => {
    const chosen = workPlans.get(w.id);
    if (!chosen) return [];
    return [
      {
        sourceWorkId: w.id,
        company: w.company,
        position: w.position,
        startDate: w.startDate,
        ...(w.endDate ? { endDate: w.endDate } : {}),
        bullets: chosen.bullets.map((b) => ({
          text: b.text.trim(),
          sourceBulletId: b.sourceBulletId,
        })),
      },
    ];
  });
  const projects = (profile.projects ?? []).flatMap((p) => {
    const chosen = projectPlans.get(p.id);
    if (!chosen) return [];
    return [
      {
        sourceProjectId: p.id,
        name: p.name,
        bullets: chosen.bullets.map((b) => ({
          text: b.text.trim(),
          sourceBulletId: b.sourceBulletId,
        })),
      },
    ];
  });

  // Master spelling wins over the model's copy.
  const masterSkills = new Map(profile.skills.map((s) => [key(s.category), s]));
  const skills = plan.skills.flatMap((s) => {
    const master = masterSkills.get(key(s.category));
    if (!master) return [];
    const items = new Map(master.items.map((i) => [key(i), i]));
    return [
      {
        category: master.category,
        items: s.items.flatMap((i) => items.get(key(i)) ?? []),
      },
    ];
  });

  const basics = { ...profile.basics, summary: plan.summary?.trim() || profile.basics.summary };
  if (!basics.summary) delete basics.summary;
  return {
    basics,
    work,
    ...(projects.length > 0 ? { projects } : {}),
    ...(profile.education ? { education: profile.education } : {}),
    skills,
    ...(profile.certifications ? { certifications: profile.certifications } : {}),
    ...(profile.languages ? { languages: profile.languages } : {}),
  };
}
