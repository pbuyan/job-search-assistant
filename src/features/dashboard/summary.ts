import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type Board,
} from "@/features/tracker/board";

export type StatusCount = { status: ApplicationStatus; count: number };

// Non-empty columns only, in board order.
export function statusCounts(board: Board): StatusCount[] {
  return APPLICATION_STATUSES.map((status) => ({
    status,
    count: board[status].length,
  })).filter((s) => s.count > 0);
}

export type UpcomingStep = {
  jobId: string;
  title: string;
  company: string;
  nextStep: string | null;
  nextStepDue: string;
};

// YYYY-MM-DD of `date` plus `days`, in UTC (date columns carry no zone).
export function isoDay(date: Date, days = 0) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Next steps due from `today` through `today + days`, soonest first.
export function upcomingSteps(board: Board, today: Date, days = 7): UpcomingStep[] {
  const from = isoDay(today);
  const to = isoDay(today, days);
  return APPLICATION_STATUSES.flatMap((s) => board[s])
    .filter(
      (c): c is typeof c & { nextStepDue: string } =>
        c.nextStepDue !== null && c.nextStepDue >= from && c.nextStepDue <= to,
    )
    .map(({ jobId, title, company, nextStep, nextStepDue }) => ({
      jobId,
      title,
      company,
      nextStep,
      nextStepDue,
    }))
    .sort((a, b) => a.nextStepDue.localeCompare(b.nextStepDue));
}
