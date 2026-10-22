"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteJob, type DeleteJobError } from "@/features/jobs/actions";
import { useRouter } from "@/i18n/navigation";

export function DeleteJobButton({
  jobId,
  title,
}: {
  jobId: string;
  title: string;
}) {
  const t = useTranslations("Jobs.detail.delete");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<DeleteJobError | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteJob(jobId);
      if (result.ok) router.push("/jobs");
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Dialog>
        <DialogTrigger render={<Button type="button" variant="outline" />}>
          {t("button")}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("body", { title })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {t("cancel")}
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={confirm}
              disabled={pending}
            >
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {error ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      ) : null}
    </div>
  );
}
