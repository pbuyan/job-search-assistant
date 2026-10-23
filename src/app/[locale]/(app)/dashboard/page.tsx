import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { getBoard } from "@/db/queries/applications";
import { listJobs } from "@/db/queries/jobs";
import { listRecentMatches } from "@/db/queries/matches";
import { getProfile } from "@/db/queries/profile";
import {
  overdueSteps,
  statusCounts,
  upcomingSteps,
} from "@/features/dashboard/summary";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return pageMetadata({ locale, page: "dashboard", path: "/dashboard" });
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { userId } = await auth();
  if (!userId) return redirect({ href: "/sign-in", locale });

  const [t, profile, jobs, board, scores] = await Promise.all([
    getTranslations("Dashboard"),
    getProfile(userId),
    listJobs(userId),
    getBoard(userId),
    listRecentMatches(userId),
  ]);
  const counts = statusCounts(board);
  const progress = {
    profile: (profile?.data.work.length ?? 0) > 0,
    job: jobs.length > 0,
    application: counts.length > 0,
  };
  const hasData = Object.values(progress).some(Boolean);
  const allDone = Object.values(progress).every(Boolean);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-start text-2xl font-semibold">{t("title")}</h1>
      {allDone ? null : <OnboardingChecklist progress={progress} />}
      {hasData ? (
        <SummaryCards
          counts={counts}
          overdue={overdueSteps(board, new Date())}
          upcoming={upcomingSteps(board, new Date())}
          scores={scores}
        />
      ) : null}
    </div>
  );
}
