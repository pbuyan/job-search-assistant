// The one shape both renderers (PDF and DOCX) draw from, built from either a
// saved resume version or the master profile. Kept free of rendering code.
import type { ProfileData, TailoredResume } from "@/db/schema";

export type ExportEntry = {
  title: string;
  subtitle?: string;
  dates?: string;
  bullets: string[];
};

export type ResumeDocument = {
  name: string;
  label?: string;
  contact: string[];
  summary?: string;
  work: ExportEntry[];
  projects: ExportEntry[];
  education: ExportEntry[];
  skills: { category: string; items: string[] }[];
  certifications: string[];
  languages: string[];
};

// Section headings and the open-ended date, in the *resume* language.
export type ExportLabels = {
  summary: string;
  work: string;
  projects: string;
  education: string;
  skills: string;
  certifications: string;
  languages: string;
  present: string;
  // After a skill category: ":" in English, " :" (no-break space) in French.
  categorySuffix: string;
};

// "2020-01" → "Jan 2020" / "janv. 2020"; a bare year stays as is; anything
// else (free text from an import) is shown unchanged.
export function formatResumeDate(value: string, lang: string): string {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value.trim());
  if (!match) return value.trim();
  const [, year, month] = match;
  try {
    return new Intl.DateTimeFormat(lang, {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
  } catch {
    return value.trim();
  }
}

function dateRange(
  start: string | undefined,
  end: string | undefined,
  lang: string,
  present: string,
): string | undefined {
  if (!start && !end) return undefined;
  if (!start) return formatResumeDate(end!, lang);
  return `${formatResumeDate(start, lang)} – ${end ? formatResumeDate(end, lang) : present}`;
}

type Shared = Omit<ProfileData, "work" | "projects">;

function sharedParts(r: Shared, lang: string, labels: ExportLabels) {
  const { basics } = r;
  return {
    name: basics.name,
    ...(basics.label ? { label: basics.label } : {}),
    contact: [
      basics.email,
      basics.phone,
      basics.location,
      ...(basics.links ?? []).map((l) => l.url),
    ].filter((v): v is string => !!v?.trim()),
    ...(basics.summary?.trim() ? { summary: basics.summary.trim() } : {}),
    education: (r.education ?? []).map((e) => ({
      title: [e.studyType, e.area].filter(Boolean).join(", ") || e.institution,
      ...(e.studyType || e.area ? { subtitle: e.institution } : {}),
      dates: dateRange(e.startDate, e.endDate, lang, labels.present),
      bullets: [],
    })),
    skills: r.skills.filter((s) => s.items.length > 0),
    certifications: (r.certifications ?? []).map((c) =>
      [c.name, c.issuer, c.date ? formatResumeDate(c.date, lang) : undefined]
        .filter(Boolean)
        .join(" · "),
    ),
    languages: (r.languages ?? []).map((l) =>
      l.fluency ? `${l.language} (${l.fluency})` : l.language,
    ),
  };
}

export function documentFromResume(
  resume: TailoredResume,
  lang: string,
  labels: ExportLabels,
): ResumeDocument {
  return {
    ...sharedParts(resume, lang, labels),
    work: resume.work.map((w) => ({
      title: w.position,
      subtitle: w.company,
      dates: dateRange(w.startDate, w.endDate, lang, labels.present),
      bullets: w.bullets.map((b) => b.text),
    })),
    projects: (resume.projects ?? []).map((p) => ({
      title: p.name,
      bullets: p.bullets.map((b) => b.text),
    })),
  };
}

export function documentFromProfile(
  profile: ProfileData,
  lang: string,
  labels: ExportLabels,
): ResumeDocument {
  return {
    ...sharedParts(profile, lang, labels),
    work: profile.work.map((w) => ({
      title: w.position,
      subtitle: [w.company, w.location].filter(Boolean).join(" · "),
      dates: dateRange(w.startDate, w.endDate, lang, labels.present),
      bullets: w.bullets.map((b) => b.text),
    })),
    projects: (profile.projects ?? []).map((p) => ({
      title: p.name,
      ...(p.url ? { subtitle: p.url } : {}),
      bullets: p.bullets.map((b) => b.text),
    })),
  };
}

// ASCII-only fallback plus the UTF-8 name for Content-Disposition, so
// "Développeuse – Acme" downloads with its accents where browsers allow.
export function contentDisposition(name: string, ext: "pdf" | "docx"): string {
  const base = name.trim() || "resume";
  const ascii =
    base
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 ._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-. ]+|[-. ]+$/g, "")
      .slice(0, 100) || "resume";
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encodeURIComponent(`${base}.${ext}`)}`;
}
