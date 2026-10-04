import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { NewJobForm } from "@/components/jobs/new-job-form";
import { routing } from "@/i18n/routing";

// Fetching, parsing and embedding a posting can take a while.
export const maxDuration = 120;

export default async function NewJobPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("Jobs.new");
  return (
    <>
      <h1 className="text-start text-2xl font-semibold">{t("title")}</h1>
      <p className="text-start text-muted-foreground">{t("description")}</p>
      <NewJobForm />
    </>
  );
}
