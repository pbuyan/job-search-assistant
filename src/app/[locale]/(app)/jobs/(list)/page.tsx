import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { Plus } from "lucide-react";
import { hasLocale } from "next-intl";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { notFound } from "next/navigation";
import { JobFilters } from "@/components/jobs/job-filters";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { listJobs, type JobListRow } from "@/db/queries/jobs";
import { getMatchingState } from "@/db/queries/profile";
import { parseJobListParams } from "@/features/matching/schemas";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/metadata";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return pageMetadata({ locale, page: "jobs", path: "/jobs" });
}

export default async function JobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { userId } = await auth();
  if (!userId) return redirect({ href: "/sign-in", locale });

  const query = parseJobListParams(await searchParams);
  const matching = await getMatchingState(userId);
  const minSalary =
    matching?.minSalary && matching.salaryCurrency
      ? { amount: matching.minSalary, currency: matching.salaryCurrency }
      : null;
  const [t, format, jobs] = await Promise.all([
    getTranslations("Jobs"),
    getFormatter(),
    listJobs(userId, query, minSalary),
  ]);
  const filtered = Boolean(
    query.remote ||
    query.location ||
    query.analyzed ||
    query.salary ||
    query.posting,
  );

  // Currency codes come from parsed postings; an unknown one would make Intl
  // throw, so it falls back to the plain number and code.
  const salary = ({
    salaryMin: lo,
    salaryMax: hi,
    salaryCurrency: currency,
  }: JobListRow) => {
    if (!currency) return null;
    const money = (n: number) => {
      try {
        return format.number(n, {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        });
      } catch {
        return `${format.number(n)} ${currency}`;
      }
    };
    if (lo && hi && lo !== hi)
      return t("salaryRange", { min: money(lo), max: money(hi) });
    const one = hi ?? lo;
    return one ? money(one) : null;
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-start text-2xl font-semibold">{t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/jobs/boards"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {t("browseBoards")}
          </Link>
          <Link href="/jobs/new" className={buttonVariants()}>
            <Plus />
            {t("add")}
          </Link>
        </div>
      </div>
      {jobs.length > 0 || filtered ? (
        <JobFilters params={query} hasMinSalary={Boolean(minSalary)} />
      ) : null}
      {query.sort === "match" && !matching?.embedded ? (
        <p className="max-w-3xl text-start text-sm text-muted-foreground">
          {t("matchUnavailable")}{" "}
          <Link href="/profile" className="underline underline-offset-4">
            {t("goToProfile")}
          </Link>
        </p>
      ) : null}
      {jobs.length === 0 ? (
        <p className="text-start text-muted-foreground">
          {filtered ? t("noneFiltered") : t("empty")}
        </p>
      ) : (
        <ul className="flex max-w-3xl flex-col divide-y rounded-xl border">
          {jobs.map((job) => {
            const pay = salary(job);
            return (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="flex flex-col gap-1 p-4 text-start hover:bg-muted/50"
                >
                  <span className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0 font-medium wrap-break-word">
                      {job.title || t("untitled")}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {job.closedAt ? (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          {t("detail.posting.closed")}
                        </Badge>
                      ) : null}
                      {job.score !== null ? (
                        <Badge variant="secondary" className="tabular-nums">
                          {t("fit", { score: job.score })}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          {t("notAnalyzed")}
                        </Badge>
                      )}
                    </span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {[
                      job.company,
                      job.location,
                      job.remote !== "unknown"
                        ? t(`detail.remote.${job.remote}`)
                        : null,
                      pay,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("added", {
                      date: format.dateTime(job.createdAt, {
                        dateStyle: "medium",
                      }),
                    })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
