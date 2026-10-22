import { createTranslator, hasLocale } from "next-intl";
import { NextResponse } from "next/server";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import {
  contentDisposition,
  type ExportLabels,
  type ResumeDocument,
} from "./document";
import { renderResumeDocx } from "./docx";
import { renderResumePdf } from "./pdf";

export const exportFormatSchema = z.enum(["pdf", "docx"]);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

const CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export type ExportError = "unauthorized" | "invalid" | "notFound" | "failed";
const STATUS: Record<ExportError, number> = {
  unauthorized: 401,
  invalid: 400,
  notFound: 404,
  failed: 500,
};

// Codes only: never resume content.
export const exportError = (error: ExportError) =>
  NextResponse.json({ ok: false, error }, { status: STATUS[error] });

// Headings come from the messages of the *resume* language (resume and UI
// languages are separate settings that happen to share message files);
// anything without messages falls back to English headings.
export async function exportLabels(lang: string): Promise<ExportLabels> {
  const locale = hasLocale(routing.locales, lang)
    ? lang
    : routing.defaultLocale;
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "ResumeExport" });
  return {
    summary: t("summary"),
    work: t("work"),
    projects: t("projects"),
    education: t("education"),
    skills: t("skills"),
    certifications: t("certifications"),
    languages: t("languages"),
    present: t("present"),
    categorySuffix: t("categorySuffix"),
  };
}

// Generated on every download from the stored data; nothing is written to
// storage, and the response isn't cached anywhere.
export async function exportResponse(input: {
  doc: ResumeDocument;
  labels: ExportLabels;
  lang: string;
  title: string;
  format: ExportFormat;
}): Promise<Response> {
  let file: Buffer;
  try {
    file =
      input.format === "pdf"
        ? await renderResumePdf(input)
        : await renderResumeDocx(input);
  } catch {
    return exportError("failed");
  }
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": CONTENT_TYPES[input.format],
      "Content-Disposition": contentDisposition(input.title, input.format),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
