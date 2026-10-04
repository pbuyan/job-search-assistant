import { Show } from "@clerk/nextjs";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const tc = await getTranslations("Common");
  return (
    <main className="flex flex-col gap-4 p-4 md:p-8">
      <div className="flex flex-wrap justify-end gap-2">
        <div className="w-40">
          <ThemeSwitcher />
        </div>
        <div className="w-40">
          <LanguageSwitcher />
        </div>
      </div>
      <h1 className="text-start text-3xl font-semibold">{t("title")}</h1>
      <p className="text-start text-muted-foreground">{t("subtitle")}</p>
      <div className="flex flex-wrap gap-2">
        <Show when="signed-out">
          <Link href="/sign-in" className={buttonVariants()}>
            {tc("signIn")}
          </Link>
          <Link href="/sign-up" className={buttonVariants({ variant: "outline" })}>
            {tc("signUp")}
          </Link>
        </Show>
        <Show when="signed-in">
          <Link href="/dashboard" className={buttonVariants()}>
            {t("goToDashboard")}
          </Link>
        </Show>
      </div>
    </main>
  );
}
