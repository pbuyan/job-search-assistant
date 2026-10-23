"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { checkJobPosting, type CheckJobResult } from "@/features/jobs/actions";
import { useRouter } from "@/i18n/navigation";

// Asks the job board whether this imported posting is still open.
export function CheckPostingButton({ jobId }: { jobId: string }) {
  const t = useTranslations("Jobs.detail.posting");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CheckJobResult | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const next = await checkJobPosting(jobId);
      setResult(next);
      // Even a failed re-parse has recorded the check (and reopened it).
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={run}
          disabled={pending}
        >
          {pending ? t("checking") : t("check")}
        </Button>
      </div>
      {result?.ok ? (
        <p role="status" className="text-start text-sm">
          {t(`outcomes.${result.outcome}`)}
        </p>
      ) : result ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t(`errors.${result.error}`)}
        </p>
      ) : null}
    </div>
  );
}
