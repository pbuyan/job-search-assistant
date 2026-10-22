import type { TailoredResume } from "@/db/schema";
import { numbersIn } from "@/features/tailoring/validate-tailoring";

export type TranslationProblem =
  | { kind: "shape"; path: string }
  | { kind: "empty"; path: string }
  | { kind: "numbers"; path: string };

const sameNumbers = (a: string, b: string) => {
  const x = numbersIn(a);
  const y = numbersIn(b);
  return x.size === y.size && [...x].every((n) => y.has(n));
};

// The translation must line up with its source entry by entry and bullet by
// bullet (same ids, same order), keep every number, and leave nothing that
// had text empty. Any problem rejects the whole output.
export function validateTranslation(
  source: TailoredResume,
  out: TailoredResume,
): TranslationProblem[] {
  const problems: TranslationProblem[] = [];
  const text = (
    path: string,
    from: string | undefined,
    to: string | undefined,
  ) => {
    if (!from?.trim()) return;
    if (!to?.trim()) problems.push({ kind: "empty", path });
    else if (!sameNumbers(from, to)) problems.push({ kind: "numbers", path });
  };

  text("basics.label", source.basics.label, out.basics.label);
  text("basics.summary", source.basics.summary, out.basics.summary);

  const entries = [
    ...source.work.map((w, i) => ({
      path: `work.${i}`,
      id: w.sourceWorkId,
      outId: out.work[i]?.sourceWorkId,
      title: [w.position, out.work[i]?.position] as const,
      bullets: [w.bullets, out.work[i]?.bullets] as const,
    })),
    ...(source.projects ?? []).map((p, i) => ({
      path: `projects.${i}`,
      id: p.sourceProjectId,
      outId: out.projects?.[i]?.sourceProjectId,
      title: [p.name, out.projects?.[i]?.name] as const,
      bullets: [p.bullets, out.projects?.[i]?.bullets] as const,
    })),
  ];
  if (
    out.work.length !== source.work.length ||
    (out.projects?.length ?? 0) !== (source.projects?.length ?? 0)
  ) {
    problems.push({ kind: "shape", path: "entries" });
  }
  for (const e of entries) {
    const [from, to] = e.bullets;
    if (e.outId !== e.id || !to || to.length !== from.length) {
      problems.push({ kind: "shape", path: e.path });
      continue;
    }
    text(`${e.path}.title`, e.title[0], e.title[1]);
    from.forEach((b, j) => {
      const path = `${e.path}.bullets.${j}`;
      if (to[j].sourceBulletId !== b.sourceBulletId)
        problems.push({ kind: "shape", path });
      else text(path, b.text, to[j].text);
    });
  }

  if (
    out.skills.length !== source.skills.length ||
    source.skills.some((s, i) => out.skills[i].items.length !== s.items.length)
  ) {
    problems.push({ kind: "shape", path: "skills" });
  }
  if ((out.education?.length ?? 0) !== (source.education?.length ?? 0)) {
    problems.push({ kind: "shape", path: "education" });
  }
  if ((out.languages?.length ?? 0) !== (source.languages?.length ?? 0)) {
    problems.push({ kind: "shape", path: "languages" });
  }
  return problems;
}

// Takes only the translatable text from a validated translation; everything
// else comes from the source version. A field the source left empty stays
// empty, and one the model left empty (only possible where validation
// doesn't require text, e.g. a skill) keeps the source text.
export function mergeTranslation(
  source: TailoredResume,
  out: TailoredResume,
): TailoredResume {
  const pick = <T extends string | undefined>(
    from: T,
    to: string | undefined,
  ): T => (from?.trim() && to?.trim() ? to.trim() : from) as T;
  const basics = { ...source.basics };
  if (source.basics.label)
    basics.label = pick(source.basics.label, out.basics.label);
  if (source.basics.summary)
    basics.summary = pick(source.basics.summary, out.basics.summary);

  return {
    ...source,
    basics,
    work: source.work.map((w, i) => ({
      ...w,
      position: pick(w.position, out.work[i]?.position),
      bullets: w.bullets.map((b, j) => ({
        sourceBulletId: b.sourceBulletId,
        text: pick(b.text, out.work[i]?.bullets[j]?.text),
      })),
    })),
    ...(source.projects
      ? {
          projects: source.projects.map((p, i) => ({
            ...p,
            name: pick(p.name, out.projects?.[i]?.name),
            bullets: p.bullets.map((b, j) => ({
              sourceBulletId: b.sourceBulletId,
              text: pick(b.text, out.projects?.[i]?.bullets[j]?.text),
            })),
          })),
        }
      : {}),
    skills: source.skills.map((s, i) => ({
      category: pick(s.category, out.skills[i]?.category),
      items: s.items.map((item, j) => pick(item, out.skills[i]?.items[j])),
    })),
    ...(source.education
      ? {
          education: source.education.map((e, i) => {
            const t = out.education?.[i];
            return {
              ...e,
              ...(e.studyType
                ? { studyType: pick(e.studyType, t?.studyType) }
                : {}),
              ...(e.area ? { area: pick(e.area, t?.area) } : {}),
            };
          }),
        }
      : {}),
    ...(source.languages
      ? {
          languages: source.languages.map((l, i) => {
            const t = out.languages?.[i];
            return {
              language: pick(l.language, t?.language),
              ...(l.fluency ? { fluency: pick(l.fluency, t?.fluency) } : {}),
            };
          }),
        }
      : {}),
  };
}
