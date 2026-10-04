// @vitest-environment node
import { Document, Packer, Paragraph } from "docx";
import { describe, expect, it } from "vitest";
import { extractResumeText, MAX_FILE_BYTES } from "./extract-text";

const lines = [
  "Marie Tremblay",
  "Développeuse logicielle",
  "Montréal, QC | marie@example.com",
  "Expérience professionnelle",
  "Développeuse senior, Boréale Inc. (janvier 2020 - présent)",
];

async function docx(paragraphs: string[]) {
  const doc = new Document({
    sections: [{ children: paragraphs.map((text) => new Paragraph(text)) }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

// Smallest valid single-page PDF with one line of text per entry. pdf.js
// rebuilds the xref table when offsets are off, so this stays simple.
function pdf(text: string[]) {
  const escape = (s: string) => s.replace(/[\\()]/g, "\\$&");
  const body = text
    .map((t, i) => `BT /F1 12 Tf 50 ${750 - i * 20} Td (${escape(t)}) Tj ET`)
    .join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (out += `${String(o).padStart(10, "0")} 00000 n \n`));
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  // WinAnsiEncoding: one byte per character, so write latin1, not UTF-8.
  return new Uint8Array(Buffer.from(out, "latin1"));
}

describe("extractResumeText", () => {
  it("extracts DOCX text, keeping accents", async () => {
    const result = await extractResumeText(await docx(lines), "cv.docx");
    expect(result).toMatchObject({ ok: true, kind: "docx" });
    if (result.ok) {
      expect(result.text).toContain("Développeuse logicielle");
      expect(result.text).toContain("marie@example.com");
    }
  });

  it("extracts PDF text", async () => {
    const result = await extractResumeText(pdf(lines.slice(0, 4).concat(lines)), "cv.pdf");
    expect(result).toMatchObject({ ok: true, kind: "pdf" });
    if (result.ok) {
      expect(result.text).toContain("Marie Tremblay");
      expect(result.text).toContain("Expérience professionnelle");
    }
  });

  it("decides the type from the bytes, not the name", async () => {
    const result = await extractResumeText(await docx(lines), "cv.pdf");
    expect(result).toEqual({ ok: false, error: "unsupportedType" });
    expect(await extractResumeText(new TextEncoder().encode("hello"), "cv.pdf")).toEqual({
      ok: false,
      error: "unsupportedType",
    });
  });

  it("rejects oversize files, unreadable documents and scans", async () => {
    expect(await extractResumeText(new Uint8Array(MAX_FILE_BYTES + 1), "cv.pdf")).toEqual({
      ok: false,
      error: "tooLarge",
    });
    expect(
      await extractResumeText(new TextEncoder().encode("PK\x03\x04 not a zip"), "cv.docx"),
    ).toEqual({ ok: false, error: "unreadable" });
    expect(await extractResumeText(pdf(["x"]), "cv.pdf")).toEqual({ ok: false, error: "noText" });
  });
});
