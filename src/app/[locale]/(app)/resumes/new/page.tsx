import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { TailorReview } from "@/components/tailoring/tailor-review";
import { getJob } from "@/db/queries/jobs";
import { getProfile } from "@/db/queries/profile";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { languageName } from "@/lib/language-name";
import { pageMetadata } from "@/lib/metadata";

// The tailoring proposal runs as a Server Action from this page.
export const maxDuration = 120;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return pageMetadata({ locale, page: "tailor", path: "/resumes/new" });
}

export default async function TailorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jobId?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { userId } = await auth();
  if (!userId) return redirect({ href: "/sign-in", locale });

  const jobId = z.uuid().safeParse((await searchParams).jobId);
  if (!jobId.success) notFound();
  const [job, profile, t] = await Promise.all([
    getJob(userId, jobId.data),
    getProfile(userId),
    getTranslations("Resumes.tailor"),
  ]);
  if (!job) notFound();
  const jobName = [job.company, job.title].filter(Boolean).join(" – ");

  return (
    <>
      <h1 className="text-start text-2xl font-semibold">{t("title")}</h1>
      <p className="text-start text-muted-foreground">
        {t.rich("for", {
          job: jobName,
          link: (chunks) => (
            <Link href={`/jobs/${job.id}`} className="underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
      {profile ? (
        <>
          <p className="text-start text-sm text-muted-foreground">
            {t("languageNote", {
              language: languageName(profile.language, locale),
            })}
          </p>
          <TailorReview jobId={job.id} defaultName={jobName} profile={profile.data} />
        </>
      ) : (
        <p className="text-start text-sm">
          {t("errors.noProfile")}{" "}
          <Link href="/profile" className="underline underline-offset-4">
            {t("goToProfile")}
          </Link>
        </p>
      )}
    </>
  );
}
