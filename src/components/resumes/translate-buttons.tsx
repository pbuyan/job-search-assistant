"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  translateResumeVersion,
  type TranslateVersionError,
} from "@/features/translation/actions";
import { useRouter } from "@/i18n/navigation";

// One button per other resume language. Each creates a new version and
// opens it; the version shown here is left as it is.
export function TranslateButtons({
  id,
  targets,
}: {
  id: string;
  targets: { code: string; name: string }[];
}) {
  const t = useTranslations("Resumes.translate");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<TranslateVersionError | null>(null);

  if (targets.length === 0) return null;

  function translate(code: string) {
    setError(null);
    setRunning(code);
    startTransition(async () => {
      const result = await translateResumeVersion({ id, targetLanguage: code });
      if (result.ok) router.push(`/resumes/${result.id}`);
      else {
        setError(result.error);
        setRunning(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="text-start text-sm text-muted-foreground">{t("hint")}</p>
      <div className="flex flex-wrap items-center gap-3">
        {targets.map(({ code, name }) => (
          <Button
            key={code}
            type="button"
            variant="outline"
            onClick={() => translate(code)}
            disabled={pending}
          >
            {pending && running === code
              ? t("translating")
              : t("button", { language: name })}
          </Button>
        ))}
        {pending ? (
          <p role="status" className="text-start text-sm text-muted-foreground">
            {t("translatingHint")}
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      ) : null}
    </div>
  );
}
