import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { StatusCount, UpcomingStep } from "@/features/dashboard/summary";
import { dueDate } from "@/features/tracker/board";
import { Link } from "@/i18n/navigation";

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
  upcoming,
  scores,
}: {
  counts: StatusCount[];
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
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-start text-sm text-muted-foreground">
              {t("noNextSteps")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {upcoming.map((step) => (
                <li key={step.applicationId}>
                  <Link href={`/tracker/${step.applicationId}`} className={rowLink}>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium wrap-break-word">
                        {step.nextStep || jobLabel(step)}
                      </span>
                      {step.nextStep ? (
                        <span className="text-sm text-muted-foreground wrap-break-word">
                          {jobLabel(step)}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t("due", {
                        date: format.dateTime(dueDate(step.nextStepDue), {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        }),
                      })}
                    </span>
                  </Link>
                </li>
              ))}
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
                    <span className="min-w-0 wrap-break-word">{jobLabel(m)}</span>
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
