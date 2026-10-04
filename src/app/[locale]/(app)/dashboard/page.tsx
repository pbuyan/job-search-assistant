import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("Dashboard");
  return (
    <>
      <h1 className="text-start text-2xl font-semibold">{t("title")}</h1>
      <p className="text-start text-muted-foreground">{t("empty")}</p>
    </>
  );
}
