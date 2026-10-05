"use client";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/profile/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MAX_FILE_BYTES, MAX_FILE_MB } from "@/features/profile/upload-limits";
import type { ProfileDataInput } from "@/prompts/schemas";

export type ParsedResume = { data: ProfileDataInput; language: string };

type ErrorKey =
  | "noFile"
  | "unauthorized"
  | "invalidFile"
  | "tooLarge"
  | "unsupportedType"
  | "unreadable"
  | "noText"
  | "tooLong"
  | "noContent"
  | "parseFailed"
  | "network";

const KNOWN: ReadonlySet<string> = new Set<ErrorKey>([
  "unauthorized",
  "invalidFile",
  "tooLarge",
  "unsupportedType",
  "unreadable",
  "noText",
  "tooLong",
  "noContent",
  "parseFailed",
]);

// Uploads a resume and hands the *proposal* to the parent. This component
// never saves anything.
export function ResumeImport({
  onParsed,
}: {
  onParsed: (parsed: ParsedResume) => void;
}) {
  const t = useTranslations("Profile.import");
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);

  async function submit() {
    const file = input.current?.files?.[0];
    if (!file) return setError("noFile");
    if (file.size > MAX_FILE_BYTES) return setError("tooLarge");

    setError(null);
    setPending(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/profile/parse-resume", {
        method: "POST",
        body,
      });
      const json: unknown = await res.json().catch(() => null);
      const result = json as
        ({ ok: true } & ParsedResume) | { ok: false; error: string } | null;
      if (res.ok && result?.ok) {
        onParsed({ data: result.data, language: result.language });
        if (input.current) input.current.value = "";
      } else if (res.status === 413) {
        // The platform (e.g. Vercel's 4.5 MB cap) can reject the body before
        // our handler runs, so there may be no JSON error code.
        setError("tooLarge");
      } else {
        const code = result && !result.ok ? result.error : "";
        setError(KNOWN.has(code) ? (code as ErrorKey) : "parseFailed");
      }
    } catch {
      setError("network");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-start text-sm text-muted-foreground">
          {t("description")}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={t("file", { maxMb: MAX_FILE_MB })} className="w-full sm:max-w-sm">
            <Input
              ref={input}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={pending}
            />
          </Field>
          <Button
            type="button"
            onClick={submit}
            disabled={pending}
            className="sm:self-end"
          >
            <Upload />
            {pending ? t("importing") : t("import")}
          </Button>
        </div>
        <p className="text-start text-sm text-muted-foreground">
          {t("privacy")}
        </p>
        <p role="alert" className="text-start text-sm text-destructive">
          {error ? t(`errors.${error}`, { maxMb: MAX_FILE_MB }) : null}
        </p>
      </CardContent>
    </Card>
  );
}
