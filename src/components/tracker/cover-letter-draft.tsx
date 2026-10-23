"use client";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  proposeCoverLetter,
  type ProposeCoverLetterError,
} from "@/features/cover-letter/actions";

// Asks for an AI draft and shows it as a proposal. "Use this draft" hands the
// text to the details form, unsaved; nothing is written here.
export function CoverLetterDraft({
  applicationId,
  onUse,
}: {
  applicationId: string;
  onUse: (text: string) => void;
}) {
  const t = useTranslations("Tracker.application.coverDraft");
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<ProposeCoverLetterError | null>(null);

  function request() {
    setError(null);
    startTransition(async () => {
      const result = await proposeCoverLetter(applicationId);
      if (result.ok) setDraft(result.text);
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={request}
          disabled={pending}
        >
          <Sparkles aria-hidden />
          {pending ? t("drafting") : t("button")}
        </Button>
        <p className="min-w-0 text-start text-xs text-muted-foreground">
          {t("hint")}
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      ) : null}
      {draft ? (
        <section
          aria-labelledby={`cover-draft-${applicationId}`}
          className="flex flex-col gap-3 rounded-lg border border-dashed p-3"
        >
          <h3
            id={`cover-draft-${applicationId}`}
            className="text-start text-sm font-semibold"
          >
            {t("title")}
          </h3>
          <div className="flex flex-col gap-2 text-start text-sm">
            {draft.split("\n\n").map((paragraph, i) => (
              <p key={i} className="wrap-break-word">
                {paragraph}
              </p>
            ))}
          </div>
          <p className="text-start text-xs text-muted-foreground">
            {t("replaceNote")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onUse(draft);
                setDraft(null);
              }}
            >
              {t("use")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDraft(null)}
            >
              {t("discard")}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
