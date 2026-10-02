import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
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
  return (
    <main className="flex flex-col gap-4 p-8">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>
      <h1 className="text-start text-3xl font-semibold">{t("title")}</h1>
      <p className="text-start text-muted-foreground">{t("subtitle")}</p>
    </main>
  );
}
