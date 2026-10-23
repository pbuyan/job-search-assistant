"use client";
import { useId, useState, useTransition } from "react";
import { useClerk } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
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
import { Label } from "@/components/ui/label";
import {
  deleteAccount,
  type DeleteAccountError,
} from "@/features/account/actions";

export function DeleteAccountButton() {
  const t = useTranslations("Settings.delete");
  const locale = useLocale();
  const { signOut } = useClerk();
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<DeleteAccountError | null>(null);
  const word = t("confirmWord");
  const matches = typed.trim().toLocaleUpperCase() === word.toLocaleUpperCase();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount({ confirm: typed });
      // The Clerk user is gone; end the local session and leave the app.
      if (result.ok) await signOut({ redirectUrl: `/${locale}` });
      else setError(result.error);
    });
  }

  return (
    <Dialog onOpenChange={(open) => !open && setTyped("")}>
      <DialogTrigger render={<Button type="button" variant="destructive" />}>
        {t("button")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogBody", { word })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>{t("confirmLabel")}</Label>
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            placeholder={word}
          />
          {error ? (
            <p role="alert" className="text-start text-sm text-destructive">
              {t(`errors.${error}`)}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t("cancel")}
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={confirm}
            disabled={!matches || pending}
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
