import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { hasLocale } from "next-intl";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ResumeActions } from "@/components/resumes/resume-actions";
import { ResumePreview } from "@/components/resumes/resume-preview";
import { TranslateButtons } from "@/components/resumes/translate-buttons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getProfile } from "@/db/queries/profile";
import { getResumeVersion } from "@/db/queries/resume-versions";
import { RESUME_LANGUAGES } from "@/features/profile/schemas";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { languageName } from "@/lib/language-name";
import { pageMetadata } from "@/lib/metadata";

// Translating runs as a Server Action from this page.
export const maxDuration = 120;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return pageMetadata({ locale, page: "resumes", path: `/resumes/${id}` });
}

export default async function ResumePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { userId } = await auth();
  if (!userId) return redirect({ href: "/sign-in", locale });
  if (!z.uuid().safeParse(id).success) notFound();

  const [version, profile, t, format] = await Promise.all([
    getResumeVersion(userId, id),
    getProfile(userId),
    getTranslations("Resumes.detail"),
    getFormatter(),
  ]);
  if (!version) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-start text-2xl font-semibold">{version.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">
            {t("language", {
              language: languageName(version.language, locale),
            })}
          </Badge>
          {version.sourceVersionId ? (
            <Badge variant="secondary">{t("translated")}</Badge>
          ) : version.isAiGenerated ? (
            <Badge variant="secondary">{t("tailored")}</Badge>
          ) : null}
          {version.locked ? (
            <Badge variant="secondary">{t("lockedBadge")}</Badge>
          ) : null}
          <span>
            {t("created", {
              date: format.dateTime(version.createdAt, { dateStyle: "medium" }),
            })}
          </span>
        </div>
        {version.jobId && version.jobTitle ? (
          <p className="text-start text-sm">
            {t("forJob")}{" "}
            <Link
              href={`/jobs/${version.jobId}`}
              className="underline underline-offset-4"
            >
              {[version.jobCompany, version.jobTitle].join(" – ")}
            </Link>
          </p>
        ) : null}
        {version.sourceVersionId ? (
          <p className="text-start text-sm">
            {t.rich("translatedFrom", {
              name: version.sourceVersionName ?? "",
              link: (chunks) => (
                <Link
                  href={`/resumes/${version.sourceVersionId}`}
                  className="underline underline-offset-4"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        ) : null}
        {version.locked ? (
          <p className="text-start text-sm text-muted-foreground">
            {t("lockedHint")}
          </p>
        ) : null}
        {/* File downloads from a route handler, so plain links, not router navigation. */}
        <div className="flex flex-wrap gap-2">
          {(["pdf", "docx"] as const).map((format) => (
            <a
              key={format}
              href={`/api/resumes/${version.id}/export?format=${format}`}
              download
              className={buttonVariants()}
            >
              <Download aria-hidden />
              {t(`download.${format}`)}
            </a>
          ))}
        </div>
        <ResumeActions
          id={version.id}
          name={version.name}
          locked={version.locked}
          editable={profile?.language === version.language}
        />
        <TranslateButtons
          id={version.id}
          targets={RESUME_LANGUAGES.filter((l) => l !== version.language).map(
            (l) => ({ code: l, name: languageName(l, locale) }),
          )}
        />
      </header>
      <ResumePreview resume={version.data} lang={version.language} />
    </div>
  );
}
