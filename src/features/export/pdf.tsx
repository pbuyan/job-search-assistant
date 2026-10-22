import { join } from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ExportEntry, ExportLabels, ResumeDocument } from "./document";

// Liberation Sans (SIL OFL, see fonts/LICENSE_LIBERATION) is metrically
// compatible with Arial and covers French accents, typographic quotes and
// no-break spaces, which the built-in PDF fonts don't fully do. The files
// are traced into the export routes via next.config.ts.
const FONT_DIR = join(process.cwd(), "src/features/export/fonts");
const FAMILY = "Liberation Sans";
Font.register({
  family: FAMILY,
  fonts: [
    { src: join(FONT_DIR, "LiberationSans-Regular.ttf") },
    { src: join(FONT_DIR, "LiberationSans-Bold.ttf"), fontWeight: "bold" },
  ],
});
// No automatic hyphenation: a resume reads better with whole words.
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: {
    fontFamily: FAMILY,
    fontSize: 10,
    lineHeight: 1.35,
    paddingVertical: 40,
    paddingHorizontal: 48,
    color: "#111111",
  },
  // The page line height is relative to 10pt; set the larger lines their own.
  name: { fontSize: 20, fontWeight: "bold", lineHeight: 1.2 },
  label: { fontSize: 12, lineHeight: 1.3, marginTop: 4 },
  contact: { fontSize: 9, color: "#444444", marginTop: 4 },
  section: { marginTop: 14 },
  heading: {
    fontSize: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottomWidth: 0.75,
    borderBottomColor: "#999999",
    paddingBottom: 2,
    marginBottom: 6,
  },
  entry: { marginBottom: 8 },
  entryHead: { flexDirection: "row", justifyContent: "space-between" },
  entryTitle: { fontWeight: "bold", flexShrink: 1, paddingRight: 8 },
  dates: { fontSize: 9, color: "#444444" },
  subtitle: { color: "#333333" },
  bullet: { flexDirection: "row", marginTop: 2 },
  bulletMark: { width: 10 },
  bulletText: { flex: 1 },
  line: { marginBottom: 2 },
  bold: { fontWeight: "bold" },
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <Text style={s.heading}>{title}</Text>
      {children}
    </View>
  );
}

function Entry({ entry }: { entry: ExportEntry }) {
  return (
    <View style={s.entry} wrap={entry.bullets.length > 4}>
      <View style={s.entryHead}>
        <Text style={s.entryTitle}>{entry.title}</Text>
        {entry.dates ? <Text style={s.dates}>{entry.dates}</Text> : null}
      </View>
      {entry.subtitle ? <Text style={s.subtitle}>{entry.subtitle}</Text> : null}
      {entry.bullets.map((text, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.bulletMark}>•</Text>
          <Text style={s.bulletText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

function ResumePdf({
  doc,
  labels,
  lang,
  title,
}: {
  doc: ResumeDocument;
  labels: ExportLabels;
  lang: string;
  title: string;
}) {
  return (
    <Document title={title} author={doc.name} language={lang}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.name}>{doc.name}</Text>
        {doc.label ? <Text style={s.label}>{doc.label}</Text> : null}
        {doc.contact.length > 0 ? (
          <Text style={s.contact}>{doc.contact.join("  ·  ")}</Text>
        ) : null}

        {doc.summary ? (
          <Section title={labels.summary}>
            <Text>{doc.summary}</Text>
          </Section>
        ) : null}
        {doc.work.length > 0 ? (
          <Section title={labels.work}>
            {doc.work.map((e, i) => (
              <Entry key={i} entry={e} />
            ))}
          </Section>
        ) : null}
        {doc.projects.length > 0 ? (
          <Section title={labels.projects}>
            {doc.projects.map((e, i) => (
              <Entry key={i} entry={e} />
            ))}
          </Section>
        ) : null}
        {doc.education.length > 0 ? (
          <Section title={labels.education}>
            {doc.education.map((e, i) => (
              <Entry key={i} entry={e} />
            ))}
          </Section>
        ) : null}
        {doc.skills.length > 0 ? (
          <Section title={labels.skills}>
            {doc.skills.map((sk) => (
              <Text key={sk.category} style={s.line}>
                <Text style={s.bold}>
                  {sk.category}
                  {labels.categorySuffix}{" "}
                </Text>
                {sk.items.join(", ")}
              </Text>
            ))}
          </Section>
        ) : null}
        {doc.certifications.length > 0 ? (
          <Section title={labels.certifications}>
            {doc.certifications.map((c, i) => (
              <Text key={i} style={s.line}>
                {c}
              </Text>
            ))}
          </Section>
        ) : null}
        {doc.languages.length > 0 ? (
          <Section title={labels.languages}>
            <Text>{doc.languages.join(" · ")}</Text>
          </Section>
        ) : null}
      </Page>
    </Document>
  );
}

export function renderResumePdf(input: {
  doc: ResumeDocument;
  labels: ExportLabels;
  lang: string;
  title: string;
}): Promise<Buffer> {
  return renderToBuffer(<ResumePdf {...input} />);
}
