import { nanoid } from "nanoid";
import type { ProfileDataInput } from "@/prompts/schemas";
import { STABLE_ID } from "./schemas";

const trimmed = (value: string | undefined) => {
  const t = value?.trim();
  return t ? t : undefined;
};

// A bullet/work entry keeps whatever valid id it already has (that is what
// makes it stable across edits) and only gets a fresh nanoid when it has none.
export const ensureId = (id: string | undefined): string =>
  id && STABLE_ID.test(id) ? id : nanoid();

// Cleans form output before validation and storage: whitespace is trimmed,
// blank optional fields become undefined, empty skill items are dropped and
// missing ids are minted. Pure apart from nanoid(); safe on client and server.
export function normalizeProfile(data: ProfileDataInput): ProfileDataInput {
  return {
    ...data,
    basics: {
      ...data.basics,
      name: data.basics.name.trim(),
      label: trimmed(data.basics.label),
      email: trimmed(data.basics.email),
      phone: trimmed(data.basics.phone),
      location: trimmed(data.basics.location),
      summary: trimmed(data.basics.summary),
    },
    work: data.work.map((job) => ({
      ...job,
      id: ensureId(job.id),
      company: job.company.trim(),
      position: job.position.trim(),
      startDate: job.startDate.trim(),
      endDate: trimmed(job.endDate),
      location: trimmed(job.location),
      bullets: job.bullets.map((b) => ({ ...b, id: ensureId(b.id), text: b.text.trim() })),
    })),
    projects: data.projects?.map((p) => ({
      ...p,
      id: ensureId(p.id),
      bullets: p.bullets.map((b) => ({ ...b, id: ensureId(b.id) })),
    })),
    education: data.education?.map((ed) => ({
      ...ed,
      institution: ed.institution.trim(),
      area: trimmed(ed.area),
      studyType: trimmed(ed.studyType),
      startDate: trimmed(ed.startDate),
      endDate: trimmed(ed.endDate),
    })),
    skills: data.skills.map((s) => ({
      category: s.category.trim(),
      items: s.items.map((i) => i.trim()).filter(Boolean),
    })),
  };
}
