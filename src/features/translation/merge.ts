import type { TailoredResume } from "@/db/schema";
import { numbersIn } from "@/features/tailoring/validate-tailoring";

// A translatable string of a resume, addressed by its path in the resume
// ("basics.summary", "work.0.bullets.2.text", "skills.1.items.0"…). Only
// these go to the model, and only these come back: the structure, names,
// employers, institutions, dates, contact details and ids never leave the
// code.
export type Segment = { id: string; text: string };

export function segmentsOf(resume: TailoredResume): Segment[] {
  const out: Segment[] = [];
  const add = (id: string, text: string | undefined) => {
    if (text?.trim()) out.push({ id, text });
  };
  add("basics.label", resume.basics.label);
  add("basics.summary", resume.basics.summary);
  resume.work.forEach((w, i) => {
    add(`work.${i}.position`, w.position);
    w.bullets.forEach((b, j) => add(`work.${i}.bullets.${j}.text`, b.text));
  });
  resume.projects?.forEach((p, i) => {
    add(`projects.${i}.name`, p.name);
    p.bullets.forEach((b, j) => add(`projects.${i}.bullets.${j}.text`, b.text));
  });
  resume.skills.forEach((s, i) => {
    add(`skills.${i}.category`, s.category);
    s.items.forEach((item, j) => add(`skills.${i}.items.${j}`, item));
  });
  resume.education?.forEach((e, i) => {
    add(`education.${i}.studyType`, e.studyType);
    add(`education.${i}.area`, e.area);
  });
  resume.languages?.forEach((l, i) => {
    add(`languages.${i}.language`, l.language);
    add(`languages.${i}.fluency`, l.fluency);
  });
  return out;
}

export type TranslationProblem =
  | { kind: "missing"; id: string }
  | { kind: "unknown"; id: string }
  | { kind: "duplicate"; id: string }
  | { kind: "empty"; id: string }
  | { kind: "numbers"; id: string };

const sameNumbers = (a: string, b: string) => {
  const x = numbersIn(a);
  const y = numbersIn(b);
  return x.size === y.size && [...x].every((n) => y.has(n));
};

// Every source segment translated exactly once, nothing else, no empty text,
// and every number kept. Any problem rejects the whole output.
export function validateTranslation(
  source: Segment[],
  out: Segment[],
): TranslationProblem[] {
  const problems: TranslationProblem[] = [];
  const expected = new Map(source.map((s) => [s.id, s.text]));
  const seen = new Set<string>();
  for (const s of out) {
    const from = expected.get(s.id);
    if (from === undefined) problems.push({ kind: "unknown", id: s.id });
    else if (seen.has(s.id)) problems.push({ kind: "duplicate", id: s.id });
    else if (!s.text.trim()) problems.push({ kind: "empty", id: s.id });
    else if (!sameNumbers(from, s.text))
      problems.push({ kind: "numbers", id: s.id });
    seen.add(s.id);
  }
  for (const id of expected.keys()) {
    if (!seen.has(id)) problems.push({ kind: "missing", id });
  }
  return problems;
}

// A copy of the source with each validated segment's text put in place.
// Ids not produced by segmentsOf(source) are ignored.
export function applyTranslation(
  source: TailoredResume,
  out: Segment[],
): TailoredResume {
  const resume = structuredClone(source);
  const valid = new Set(segmentsOf(source).map((s) => s.id));
  for (const { id, text } of out) {
    if (!valid.has(id)) continue;
    const path = id.split(".");
    const key = path.pop()!;
    let node: unknown = resume;
    for (const part of path) node = (node as Record<string, unknown>)[part];
    (node as Record<string, unknown>)[key] = text.trim();
  }
  return resume;
}
