"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createJob, type CreateJobError } from "@/features/jobs/actions";
import { Link, useRouter } from "@/i18n/navigation";

// Imports one board posting through the normal add-job path (board API,
// requirement extraction, indexing), then refreshes the list so the row
// shows as imported.
export function ImportPostingButton({
  url,
  title,
}: {
  url: string;
  title: string;
}) {
  const t = useTranslations("Jobs.boards");
  const tErrors = useTranslations("Jobs.new.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<CreateJobError | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await createJob({ url });
      if (result.ok) {
        setJobId(result.jobId);
        router.refresh();
      } else setError(result.error);
    });
  }

  if (jobId) {
    return (
      <Link
        href={`/jobs/${jobId}`}
        className="text-sm underline underline-offset-4"
      >
        {t("open")}
      </Link>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={pending}
        aria-label={t("importLabel", { title })}
      >
        {pending ? t("importing") : t("import")}
      </Button>
      {error ? (
        <p role="alert" className="max-w-56 text-end text-xs text-destructive">
          {tErrors(error)}
        </p>
      ) : null}
    </div>
  );
}
