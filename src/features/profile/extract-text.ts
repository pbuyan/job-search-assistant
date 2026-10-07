import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { MAX_FILE_BYTES } from "./upload-limits";

export { MAX_FILE_BYTES };
// A resume is a few thousand characters; this guards the model call, and an
// over-long document is rejected rather than silently cut.
export const MAX_TEXT_CHARS = 60_000;
const MIN_TEXT_CHARS = 40; // below this a PDF is almost certainly a scan

export type ExtractError =
  | "tooLarge"
  | "unsupportedType"
  | "unreadable"
  | "noText"
  | "tooLong";

export type ExtractResult =
  | { ok: true; text: string; kind: "pdf" | "docx" }
  | { ok: false; error: ExtractError };

// Decide the format from the file's bytes, not its name or declared MIME
// type, which the client controls.
function sniff(bytes: Uint8Array): "pdf" | "docx" | null {
  const head = (n: number) => String.fromCharCode(...bytes.subarray(0, n));
  if (head(5) === "%PDF-") return "pdf";
  if (head(4) === "PK\x03\x04") return "docx"; // validated by mammoth below
  return null;
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Never log `text` or error details from the parsers: both can echo
// resume content.
export async function extractResumeText(
  bytes: Uint8Array,
  fileName: string,
): Promise<ExtractResult> {
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, error: "tooLarge" };
  const kind = sniff(bytes);
  if (!kind) return { ok: false, error: "unsupportedType" };
  const lower = fileName.toLowerCase();
  if (kind === "pdf" ? !lower.endsWith(".pdf") : !lower.endsWith(".docx")) {
    return { ok: false, error: "unsupportedType" };
  }

  let raw: string;
  try {
    if (kind === "pdf") {
      const parser = new PDFParse({ data: bytes });
      try {
        raw = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    } else {
      raw = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    }
  } catch {
    return { ok: false, error: "unreadable" };
  }

  const text = tidy(raw);
  if (text.length < MIN_TEXT_CHARS) return { ok: false, error: "noText" };
  if (text.length > MAX_TEXT_CHARS) return { ok: false, error: "tooLong" };
  return { ok: true, text, kind };
}
