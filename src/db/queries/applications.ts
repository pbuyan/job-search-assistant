import { and, asc, desc, eq, inArray, min, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  applicationEvents,
  applications,
  applicationStatus,
  jobMatches,
  jobs,
} from "@/db/schema";
import {
  emptyBoard,
  placeInColumn,
  type ApplicationStatus,
  type Board,
} from "@/features/tracker/board";

// Compile-time check that the client-side status list matches the pg enum.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const statusesMatch: Same<
  ApplicationStatus,
  (typeof applicationStatus.enumValues)[number]
> = true;
void statusesMatch;

export async function getApplicationForJob(userId: string, jobId: string) {
  const [row] = await db
    .select({ id: applications.id, status: applications.status })
    .from(applications)
    .where(and(eq(applications.jobId, jobId), eq(applications.userId, userId)))
    .limit(1);
  return row ?? null;
}

// Cards per column, in board order, with the job's latest fit score.
export async function getBoard(userId: string): Promise<Board> {
  const rows = await db
    .select({
      id: applications.id,
      status: applications.status,
      jobId: applications.jobId,
      company: jobs.company,
      title: jobs.title,
      nextStep: applications.nextStep,
      nextStepDue: applications.nextStepDue,
    })
    .from(applications)
    .innerJoin(
      jobs,
      and(eq(jobs.id, applications.jobId), eq(jobs.userId, userId)),
    )
    .where(eq(applications.userId, userId))
    .orderBy(asc(applications.boardPosition), asc(applications.createdAt));

  const scores = new Map<string, number>();
  if (rows.length > 0) {
    const latest = await db
      .selectDistinctOn([jobMatches.jobId], {
        jobId: jobMatches.jobId,
        score: jobMatches.score,
      })
      .from(jobMatches)
      .where(
        and(
          eq(jobMatches.userId, userId),
          inArray(
            jobMatches.jobId,
            rows.map((r) => r.jobId),
          ),
        ),
      )
      .orderBy(jobMatches.jobId, desc(jobMatches.createdAt));
    for (const m of latest) scores.set(m.jobId, m.score);
  }

  const board = emptyBoard();
  for (const { status, ...card } of rows) {
    board[status].push({ ...card, score: scores.get(card.jobId) ?? null });
  }
  return board;
}

// Adds the job to the top of "saved" with a status_change event, or returns
// the existing application. Null when the job isn't the user's.
export async function trackJob(userId: string, jobId: string) {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
      .limit(1);
    if (!job) return null;

    const [top] = await tx
      .select({ position: min(applications.boardPosition) })
      .from(applications)
      .where(
        and(eq(applications.userId, userId), eq(applications.status, "saved")),
      );
    const [created] = await tx
      .insert(applications)
      .values({
        userId,
        jobId,
        status: "saved",
        boardPosition: (top?.position ?? 1) - 1,
      })
      .onConflictDoNothing({
        target: [applications.userId, applications.jobId],
      })
      .returning({ id: applications.id });

    if (!created) {
      const [existing] = await tx
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(eq(applications.userId, userId), eq(applications.jobId, jobId)),
        );
      return existing.id;
    }
    await tx.insert(applicationEvents).values({
      applicationId: created.id,
      type: "status_change",
      toStatus: "saved",
    });
    return created.id;
  });
}

// Puts the application at `index` in the `status` column and renumbers that
// column. A status change also writes an application_events row, and the
// first move to "applied" sets applied_at. False when not the user's.
export async function moveApplication(
  userId: string,
  input: { applicationId: string; status: ApplicationStatus; index: number },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [app] = await tx
      .select({ status: applications.status, appliedAt: applications.appliedAt })
      .from(applications)
      .where(
        and(
          eq(applications.id, input.applicationId),
          eq(applications.userId, userId),
        ),
      )
      .for("update");
    if (!app) return false;

    const others = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.userId, userId),
          eq(applications.status, input.status),
          ne(applications.id, input.applicationId),
        ),
      )
      .orderBy(asc(applications.boardPosition), asc(applications.createdAt));
    const order = placeInColumn(
      others.map((o) => o.id),
      input.applicationId,
      input.index,
    );

    const changed = app.status !== input.status;
    for (const [position, id] of order.entries()) {
      const moved = id === input.applicationId;
      await tx
        .update(applications)
        .set({
          boardPosition: position,
          ...(moved && changed ? { status: input.status } : {}),
          ...(moved && changed && input.status === "applied" && !app.appliedAt
            ? { appliedAt: new Date() }
            : {}),
        })
        .where(and(eq(applications.id, id), eq(applications.userId, userId)));
    }

    if (changed) {
      await tx.insert(applicationEvents).values({
        applicationId: input.applicationId,
        type: "status_change",
        fromStatus: app.status,
        toStatus: input.status,
      });
    }
    return true;
  });
}
