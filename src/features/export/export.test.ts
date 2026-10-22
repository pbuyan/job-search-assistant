// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ProfileData, TailoredResume } from "@/db/schema";
import { extractResumeText } from "@/features/profile/extract-text";
import {
  contentDisposition,
  documentFromProfile,
  documentFromResume,
  formatResumeDate,
  type ExportLabels,
} from "./document";
import { renderResumeDocx } from "./docx";
import { renderResumePdf } from "./pdf";

const labels: ExportLabels = {
  summary: "Profil",
  work: "Expérience professionnelle",
  projects: "Projets",
  education: "Formation",
  skills: "Compétences",
  certifications: "Certifications",
  languages: "Langues",
  present: "Aujourd'hui",
  categorySuffix: "\u00a0:",
};

const resume: TailoredResume = {
  basics: {
    name: "Hélène Côté",
    label: "Développeuse principale",
    email: "helene@example.com",
    summary: "Développeuse « full stack » depuis 8 ans.",
  },
  work: [
    {
      sourceWorkId: "w1",
      company: "Société Générale de Logiciels",
      position: "Développeuse principale",
      startDate: "2019-03",
      bullets: [
        {
          sourceBulletId: "b1",
          text: "A réduit la latence de 40 % pour 1 200 magasins.",
        },
      ],
    },
  ],
  education: [
    {
      institution: "Université Laval",
      studyType: "B. Sc.",
      area: "Informatique",
      endDate: "2015",
    },
  ],
  skills: [
    { category: "Langages", items: ["TypeScript", "Java"] },
    { category: "Vide", items: [] },
  ],
  languages: [{ language: "Français", fluency: "langue maternelle" }],
};

describe("formatResumeDate", () => {
  it("formats year-month in the resume language and leaves other text alone", () => {
    expect(formatResumeDate("2019-03", "en")).toBe("Mar 2019");
    expect(formatResumeDate("2019-03", "fr")).toBe("mars 2019");
    expect(formatResumeDate("2015", "fr")).toBe("2015");
    expect(formatResumeDate("Summer 2015", "en")).toBe("Summer 2015");
  });
});

describe("documentFromResume / documentFromProfile", () => {
  it("builds sections with dates and the open-ended label in the resume language", () => {
    const doc = documentFromResume(resume, "fr", labels);
    expect(doc.work[0]).toEqual({
      title: "Développeuse principale",
      subtitle: "Société Générale de Logiciels",
      dates: "mars 2019 – Aujourd'hui",
      bullets: ["A réduit la latence de 40 % pour 1 200 magasins."],
    });
    expect(doc.education[0]).toMatchObject({
      title: "B. Sc., Informatique",
      subtitle: "Université Laval",
      dates: "2015",
    });
    expect(doc.skills).toEqual([
      { category: "Langages", items: ["TypeScript", "Java"] },
    ]);
    expect(doc.languages).toEqual(["Français (langue maternelle)"]);
  });

  it("exports the master profile including locations and project links", () => {
    const profile: ProfileData = {
      basics: { name: "Ada" },
      work: [
        {
          id: "w1",
          company: "Acme",
          position: "Engineer",
          location: "Toronto",
          startDate: "2018-01",
          endDate: "2020-06",
          bullets: [{ id: "b1", text: "Built things" }],
        },
      ],
      projects: [
        { id: "p1", name: "CLI", url: "https://example.com", bullets: [] },
      ],
      skills: [],
    };
    const doc = documentFromProfile(profile, "en", {
      ...labels,
      present: "Present",
    });
    expect(doc.work[0]).toMatchObject({
      subtitle: "Acme · Toronto",
      dates: "Jan 2018 – Jun 2020",
    });
    expect(doc.projects[0]).toMatchObject({
      title: "CLI",
      subtitle: "https://example.com",
    });
  });
});

describe("contentDisposition", () => {
  it("gives an ASCII fallback and the UTF-8 name", () => {
    expect(contentDisposition("Développeuse – Acme", "pdf")).toBe(
      `attachment; filename="Developpeuse - Acme.pdf"; filename*=UTF-8''D%C3%A9veloppeuse%20%E2%80%93%20Acme.pdf`,
    );
    expect(contentDisposition("  ", "docx")).toContain(
      'filename="resume.docx"',
    );
  });
});

describe("renderers", () => {
  const input = {
    doc: documentFromResume(resume, "fr", labels),
    labels,
    lang: "fr",
    title: "Hélène Côté – CV",
  };

  it("renders a PDF whose text keeps the accents", async () => {
    const pdf = await renderResumePdf(input);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const extracted = await extractResumeText(new Uint8Array(pdf), "cv.pdf");
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    expect(extracted.text).toContain("Hélène Côté");
    expect(extracted.text).toMatch(/EXPÉRIENCE PROFESSIONNELLE/i);
    expect(extracted.text).toContain("Société Générale de Logiciels");
  });

  it("renders a DOCX with the same content", async () => {
    const docx = await renderResumeDocx(input);
    const extracted = await extractResumeText(new Uint8Array(docx), "cv.docx");
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    expect(extracted.text).toContain("Hélène Côté");
    expect(extracted.text).toContain(
      "A réduit la latence de 40 % pour 1 200 magasins.",
    );
    expect(extracted.text).toMatch(/Langages\s:\sTypeScript, Java/);
  });
});
