import { auth } from "@clerk/nextjs/server";
import { Plus } from "lucide-react";
import { hasLocale } from "next-intl";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { listJobs } from "@/db/queries/jobs";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export default async function JobsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { userId } = await auth();
  if (!userId) return redirect({ href: "/sign-in", locale });

  const [t, format, jobs] = await Promise.all([
    getTranslations("Jobs"),
    getFormatter(),
    listJobs(userId),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-start text-2xl font-semibold">{t("title")}</h1>
        <Link href="/jobs/new" className={buttonVariants()}>
          <Plus />
          {t("add")}
        </Link>
      </div>
      {jobs.length === 0 ? (
        <p className="text-start text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex max-w-3xl flex-col divide-y rounded-xl border">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/jobs/${job.id}`}
                className="flex flex-col gap-0.5 p-4 text-start hover:bg-muted/50"
              >
                <span className="font-medium">
                  {job.title || t("untitled")}
                </span>
                <span className="text-sm text-muted-foreground">
                  {[job.company, job.location].filter(Boolean).join(" · ")}
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
          ))}
        </ul>
      )}
    </>
  );
}
