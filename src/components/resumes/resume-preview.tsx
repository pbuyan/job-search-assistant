import { getTranslations } from "next-intl/server";
import type { TailoredResume } from "@/db/schema";

// Read-only rendering of a saved resume version. `lang` is the resume's own
// language (resume_versions.language), separate from the UI locale used for
// the section headings.
export async function ResumePreview({
  resume,
  lang,
}: {
  resume: TailoredResume;
  lang: string;
}) {
  const t = await getTranslations("Resumes.preview");
  const { basics } = resume;
  const contact = [basics.email, basics.phone, basics.location].filter(Boolean);

  return (
    <article lang={lang} className="flex max-w-3xl flex-col gap-5 rounded-xl border p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <p className="text-start text-xl font-semibold">{basics.name}</p>
        {basics.label ? <p className="text-start">{basics.label}</p> : null}
        {contact.length > 0 ? (
          <p className="text-start text-sm text-muted-foreground">{contact.join(" · ")}</p>
        ) : null}
        {basics.summary ? <p className="mt-2 text-start text-sm">{basics.summary}</p> : null}
      </header>

      {resume.work.length > 0 ? (
        <Section title={t("work")}>
          {resume.work.map((w) => (
            <div key={w.sourceWorkId} className="flex flex-col gap-1">
              <p className="text-start font-medium">
                {w.position} · {w.company}
              </p>
              <p className="text-start text-xs text-muted-foreground">
                {w.startDate} – {w.endDate ?? t("present")}
              </p>
              <Bullets items={w.bullets.map((b) => b.text)} />
            </div>
          ))}
        </Section>
      ) : null}

      {resume.projects && resume.projects.length > 0 ? (
        <Section title={t("projects")}>
          {resume.projects.map((p) => (
            <div key={p.sourceProjectId} className="flex flex-col gap-1">
              <p className="text-start font-medium">{p.name}</p>
              <Bullets items={p.bullets.map((b) => b.text)} />
            </div>
          ))}
        </Section>
      ) : null}

      {resume.education && resume.education.length > 0 ? (
        <Section title={t("education")}>
          {resume.education.map((e, i) => (
            <p key={i} className="text-start text-sm">
              {[e.studyType, e.area].filter(Boolean).join(", ")}
              {e.studyType || e.area ? " · " : ""}
              {e.institution}
              {e.endDate ? ` (${e.endDate})` : ""}
            </p>
          ))}
        </Section>
      ) : null}

      {resume.skills.length > 0 ? (
        <Section title={t("skills")}>
          {resume.skills.map((s) => (
            <p key={s.category} className="text-start text-sm">
              <span className="font-medium">{s.category}:</span> {s.items.join(", ")}
            </p>
          ))}
        </Section>
      ) : null}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="border-b pb-1 text-start text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc ps-5 text-start text-sm">
      {items.map((text, i) => (
        <li key={i}>{text}</li>
      ))}
    </ul>
  );
}
