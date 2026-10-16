"use client";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// Never renders or logs `error.message`: it can contain profile or job data.
export default function LocaleError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("Errors");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold text-balance">{t("title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("body")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => reset()}>{t("retry")}</Button>
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
