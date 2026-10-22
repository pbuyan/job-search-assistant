import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { NewJobForm } from "@/components/jobs/new-job-form";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/metadata";

// Fetching, parsing and embedding a posting can take a while.
export const maxDuration = 120;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return pageMetadata({ locale, page: "newJob", path: "/jobs/new" });
}

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
      <p className="text-start text-sm text-muted-foreground">
        {t.rich("browseBoards", {
          link: (chunks) => (
            <Link href="/jobs/boards" className="underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
      <NewJobForm />
    </>
  );
}
