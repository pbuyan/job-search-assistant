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
  applicationId: string;
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

// Applications still in progress. A next step on a closed one (accepted,
// rejected, withdrawn, ghosted) is history, so it is never "overdue".
export const OPEN_STATUSES = [
  "saved",
  "applied",
  "screening",
  "interviewing",
  "offer",
] as const satisfies readonly ApplicationStatus[];

export const isOpenStatus = (status: ApplicationStatus) =>
  (OPEN_STATUSES as readonly ApplicationStatus[]).includes(status);

export type DueState = "overdue" | "today" | null;

// How urgent a next step is, from YYYY-MM-DD strings (both UTC days).
export function dueState(nextStepDue: string | null, today: string): DueState {
  if (!nextStepDue) return null;
  if (nextStepDue < today) return "overdue";
  return nextStepDue === today ? "today" : null;
}

// Next steps of open applications due before `today`, most overdue first.
export function overdueSteps(board: Board, today: Date): UpcomingStep[] {
  const day = isoDay(today);
  return OPEN_STATUSES.flatMap((s) => board[s])
    .filter(
      (c): c is typeof c & { nextStepDue: string } =>
        c.nextStepDue !== null && c.nextStepDue < day,
    )
    .map(({ id, jobId, title, company, nextStep, nextStepDue }) => ({
      applicationId: id,
      jobId,
      title,
      company,
      nextStep,
      nextStepDue,
    }))
    .sort((a, b) => a.nextStepDue.localeCompare(b.nextStepDue));
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
    .map(({ id, jobId, title, company, nextStep, nextStepDue }) => ({
      applicationId: id,
      jobId,
      title,
      company,
      nextStep,
      nextStepDue,
    }))
    .sort((a, b) => a.nextStepDue.localeCompare(b.nextStepDue));
}
