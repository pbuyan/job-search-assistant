import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const [t, tc] = await Promise.all([
    getTranslations("Errors"),
    getTranslations("Common"),
  ]);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      {/* not-found.tsx can't export metadata; React 19 hoists this into <head>. */}
      <title>{`${t("notFound.title")} | ${tc("appName")}`}</title>
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold text-balance">{t("notFound.title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("notFound.body")}</p>
      <Link href="/" className={buttonVariants()}>
        {t("home")}
      </Link>
    </main>
  );
}
