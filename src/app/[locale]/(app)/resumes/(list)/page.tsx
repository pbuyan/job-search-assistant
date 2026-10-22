import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { hasLocale } from "next-intl";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { listResumeVersions } from "@/db/queries/resume-versions";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { languageName } from "@/lib/language-name";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return pageMetadata({ locale, page: "resumes", path: "/resumes" });
}

export default async function ResumesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { userId } = await auth();
  if (!userId) return redirect({ href: "/sign-in", locale });

  const [t, format, versions] = await Promise.all([
    getTranslations("Resumes"),
    getFormatter(),
    listResumeVersions(userId),
  ]);

  return (
    <>
      <h1 className="text-start text-2xl font-semibold">{t("title")}</h1>
      <p className="text-start text-muted-foreground">{t("description")}</p>
      {versions.length === 0 ? (
        <p className="text-start text-sm text-muted-foreground">
          {t("empty")}{" "}
          <Link href="/jobs" className="underline underline-offset-4">
            {t("goToJobs")}
          </Link>
        </p>
      ) : (
        <ul className="flex max-w-3xl flex-col divide-y rounded-xl border">
          {versions.map((v) => (
            <li key={v.id}>
              <Link
                href={`/resumes/${v.id}`}
                className="flex flex-col gap-0.5 p-4 text-start hover:bg-muted/50"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {v.name}
                  <Badge variant="outline">{languageName(v.language, locale)}</Badge>
                </span>
                {v.jobTitle ? (
                  <span className="text-sm text-muted-foreground">
                    {t("forJob", { job: [v.jobCompany, v.jobTitle].join(" – ") })}
                  </span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {t("created", {
                    date: format.dateTime(v.createdAt, { dateStyle: "medium" }),
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
