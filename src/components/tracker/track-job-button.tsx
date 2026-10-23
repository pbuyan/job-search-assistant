"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { trackJob, type TrackerError } from "@/features/tracker/actions";
import { useRouter } from "@/i18n/navigation";

export function TrackJobButton({ jobId }: { jobId: string }) {
  const t = useTranslations("Tracker.track");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<TrackerError | null>(null);

  function track() {
    setError(null);
    startTransition(async () => {
      const result = await trackJob(jobId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" onClick={track} disabled={pending}>
        {pending ? t("adding") : t("add")}
      </Button>
      {error ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      ) : null}
    </div>
  );
}
