"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { analyzeJob, type AnalyzeJobError } from "@/features/jobs/actions";
import { Link, useRouter } from "@/i18n/navigation";

export function AnalyzeButton({
  jobId,
  rerun = false,
}: {
  jobId: string;
  rerun?: boolean;
}) {
  const t = useTranslations("Jobs.detail");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<AnalyzeJobError | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await analyzeJob(jobId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={rerun ? "outline" : "default"}
          onClick={run}
          disabled={pending}
        >
          {pending ? t("analyzing") : rerun ? t("rerun") : t("analyze")}
        </Button>
        {pending ? (
          <p role="status" className="text-start text-sm text-muted-foreground">
            {t("analyzingHint")}
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t(`errors.${error}`)}{" "}
          {error === "noProfile" ? (
            <Link href="/profile" className="underline underline-offset-4">
              {t("goToProfile")}
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
