"use client";
import { CalendarClock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { BoardCard } from "@/features/tracker/board";
import { Link } from "@/i18n/navigation";

// next_step_due is a calendar date with no time zone; format it as UTC so it
// never shifts by a day in the viewer's zone.
function dueDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function ApplicationCard({
  card,
  overlay = false,
  className,
}: {
  card: BoardCard;
  overlay?: boolean;
  className?: string;
}) {
  const t = useTranslations("Tracker.card");
  const format = useFormatter();

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3 text-start text-card-foreground shadow-xs",
        overlay && "shadow-lg",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground wrap-break-word hyphens-auto">
        {card.company || t("noCompany")}
      </p>
      {overlay ? (
        <p className="font-medium wrap-break-word hyphens-auto">
          {card.title || t("untitled")}
        </p>
      ) : (
        <Link
          href={`/jobs/${card.jobId}`}
          className="font-medium wrap-break-word hyphens-auto underline-offset-4 hover:underline"
        >
          {card.title || t("untitled")}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {card.score !== null ? (
          <Badge variant="secondary" className="tabular-nums">
            {t("fit", { score: card.score })}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            {t("notAnalyzed")}
          </Badge>
        )}
      </div>
      {card.nextStep || card.nextStepDue ? (
        <div className="flex min-w-0 items-start gap-1.5 text-sm">
          <CalendarClock
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <p className="min-w-0 wrap-break-word hyphens-auto">
            {card.nextStep ? (
              <span>{card.nextStep}</span>
            ) : (
              <span className="text-muted-foreground">{t("nextStep")}</span>
            )}
            {card.nextStepDue ? (
              <span className="text-muted-foreground">
                {" · "}
                {t("due", {
                  date: format.dateTime(dueDate(card.nextStepDue), {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  }),
                })}
              </span>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
