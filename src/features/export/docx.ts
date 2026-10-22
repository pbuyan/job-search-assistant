import {
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import type { ExportEntry, ExportLabels, ResumeDocument } from "./document";

// Plain single-column layout with real Word bullets and no tables or text
// boxes, so applicant tracking systems read it in order. Sizes are in
// half-points; the right tab stop sits at the text width of a Letter page
// with 0.75" margins (7" = 10080 twips).
const RIGHT_TAB = 10080;

// Word wants a region for spell-checking; the app follows Canadian usage.
const WORD_LANGUAGE: Record<string, string> = { en: "en-CA", fr: "fr-CA" };

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 100 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 },
    },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 20 })],
  });
}

function entry(e: ExportEntry): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 120 },
      tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
      keepNext: true,
      children: [
        new TextRun({ text: e.title, bold: true }),
        ...(e.dates
          ? [new TextRun({ text: `\t${e.dates}`, size: 18, color: "444444" })]
          : []),
      ],
    }),
    ...(e.subtitle
      ? [
          new Paragraph({
            keepNext: e.bullets.length > 0,
            children: [new TextRun({ text: e.subtitle, color: "333333" })],
          }),
        ]
      : []),
    ...e.bullets.map(
      (text) =>
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 40 },
          children: [new TextRun(text)],
        }),
    ),
  ];
}

export function renderResumeDocx(input: {
  doc: ResumeDocument;
  labels: ExportLabels;
  lang: string;
  title: string;
}): Promise<Buffer> {
  const { doc, labels } = input;
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: doc.name, bold: true, size: 40 })],
    }),
    ...(doc.label
      ? [
          new Paragraph({
            children: [new TextRun({ text: doc.label, size: 24 })],
          }),
        ]
      : []),
    ...(doc.contact.length > 0
      ? [
          new Paragraph({
            spacing: { before: 60 },
            children: [
              new TextRun({
                text: doc.contact.join("  ·  "),
                size: 18,
                color: "444444",
              }),
            ],
          }),
        ]
      : []),
  ];

  if (doc.summary)
    children.push(heading(labels.summary), new Paragraph(doc.summary));
  const sections: [string, ExportEntry[]][] = [
    [labels.work, doc.work],
    [labels.projects, doc.projects],
    [labels.education, doc.education],
  ];
  for (const [title, entries] of sections) {
    if (entries.length > 0)
      children.push(heading(title), ...entries.flatMap(entry));
  }
  if (doc.skills.length > 0) {
    children.push(
      heading(labels.skills),
      ...doc.skills.map(
        (sk) =>
          new Paragraph({
            spacing: { before: 40 },
            children: [
              new TextRun({
                text: `${sk.category}${labels.categorySuffix} `,
                bold: true,
              }),
              new TextRun(sk.items.join(", ")),
            ],
          }),
      ),
    );
  }
  if (doc.certifications.length > 0) {
    children.push(
      heading(labels.certifications),
      ...doc.certifications.map((c) => new Paragraph(c)),
    );
  }
  if (doc.languages.length > 0) {
    children.push(
      heading(labels.languages),
      new Paragraph(doc.languages.join(" · ")),
    );
  }

  const document = new Document({
    title: input.title,
    creator: doc.name,
    styles: {
      default: {
        // Spell-checking in Word follows the resume's language.
        document: {
          run: {
            font: "Arial",
            size: 20,
            language: { value: WORD_LANGUAGE[input.lang] ?? input.lang },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}
