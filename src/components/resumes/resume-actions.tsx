"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/profile/field";
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
import { Input } from "@/components/ui/input";
import {
  deleteResumeVersion,
  renameResumeVersion,
  type ResumeVersionError,
} from "@/features/tailoring/actions";
import { useRouter } from "@/i18n/navigation";

export function ResumeActions({ id, name }: { id: string; name: string }) {
  const t = useTranslations("Resumes.detail");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<ResumeVersionError | null>(null);
  const [pending, startTransition] = useTransition();

  function rename(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await renameResumeVersion({ id, name: value });
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else setError(result.error);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteResumeVersion(id);
      if (result.ok) router.push("/resumes");
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {editing ? (
        <form onSubmit={rename} className="flex flex-wrap items-end gap-2" noValidate>
          <Field label={t("name")} className="min-w-0 flex-1 basis-64">
            <Input value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Button type="submit" disabled={pending || !value.trim()}>
            {t("saveName")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setValue(name);
              setEditing(false);
            }}
          >
            {t("cancel")}
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            {t("rename")}
          </Button>
          <Dialog>
            <DialogTrigger render={<Button type="button" variant="outline" />}>
              {t("delete")}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("deleteTitle")}</DialogTitle>
                <DialogDescription>{t("deleteBody", { name })}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  {t("cancel")}
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={remove}
                  disabled={pending}
                >
                  {t("confirmDelete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      ) : null}
    </div>
  );
}
