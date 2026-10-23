import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatusCount, UpcomingStep } from "@/features/dashboard/summary";
import { dueDate } from "@/features/tracker/board";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type RecentScore = {
  jobId: string;
  score: number;
  title: string;
  company: string;
};

const rowLink =
  "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-start outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50";

export async function SummaryCards({
  counts,
  overdue,
  upcoming,
  scores,
}: {
  counts: StatusCount[];
  overdue: UpcomingStep[];
  upcoming: UpcomingStep[];
  scores: RecentScore[];
}) {
  const [t, ts, format] = await Promise.all([
    getTranslations("Dashboard.cards"),
    getTranslations("Tracker.status"),
    getFormatter(),
  ]);
  const jobLabel = (j: { title: string; company: string }) =>
    [j.title || t("untitled"), j.company].filter(Boolean).join(" · ");
  const day = (value: string) =>
    format.dateTime(dueDate(value), { dateStyle: "medium", timeZone: "UTC" });
  const stepRow = (step: UpcomingStep, when: string, late = false) => (
    <li key={step.applicationId}>
      <Link href={`/tracker/${step.applicationId}`} className={rowLink}>
        <span className="flex min-w-0 flex-col">
          <span className="font-medium wrap-break-word">
            {step.nextStep || jobLabel(step)}
          </span>
          {step.nextStep ? (
            <span className="text-sm wrap-break-word text-muted-foreground">
              {jobLabel(step)}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "text-sm",
            late ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {when}
        </span>
      </Link>
    </li>
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-start">
            <h2>{t("byStatus")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {counts.length === 0 ? (
            <p className="text-start text-sm text-muted-foreground">
              {t("noApplications")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {counts.map(({ status, count }) => (
                <li
                  key={status}
                  className="flex items-center justify-between gap-3 px-2 py-1"
                >
                  <span className="text-start">{ts(status)}</span>
                  <Badge variant="secondary" className="tabular-nums">
                    <span aria-hidden>{format.number(count)}</span>
                    <span className="sr-only">
                      {t("byStatusCount", { count })}
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/tracker"
            className="self-start text-sm underline underline-offset-4"
          >
            {t("openTracker")}
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-start">
            <h2>{t("nextSteps")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {overdue.length > 0 ? (
            <section
              aria-labelledby="overdue-heading"
              className="flex flex-col gap-1"
            >
              <h3
                id="overdue-heading"
                className="px-2 text-start text-sm font-semibold text-destructive"
              >
                {t("overdue")}
              </h3>
              <ul className="flex flex-col gap-1">
                {overdue.map((step) =>
                  stepRow(
                    step,
                    t("wasDue", { date: day(step.nextStepDue) }),
                    true,
                  ),
                )}
              </ul>
            </section>
          ) : null}
          {upcoming.length === 0 ? (
            <p className="text-start text-sm text-muted-foreground">
              {t("noNextSteps")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {upcoming.map((step) =>
                stepRow(step, t("due", { date: day(step.nextStepDue) })),
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-start">
            <h2>{t("recentScores")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scores.length === 0 ? (
            <p className="text-start text-sm text-muted-foreground">
              {t("noScores")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {scores.map((m) => (
                <li key={m.jobId}>
                  <Link href={`/jobs/${m.jobId}`} className={rowLink}>
                    <span className="min-w-0 wrap-break-word">
                      {jobLabel(m)}
                    </span>
                    <Badge variant="outline" className="tabular-nums">
                      {t("score", { score: m.score })}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
