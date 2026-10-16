import { describe, expect, it } from "vitest";
import { emptyBoard, type BoardCard } from "@/features/tracker/board";
import { statusCounts, upcomingSteps } from "@/features/dashboard/summary";

const card = (id: string, nextStepDue: string | null): BoardCard => ({
  id,
  jobId: `job-${id}`,
  company: "Acme",
  title: `Role ${id}`,
  score: null,
  nextStep: nextStepDue ? "Follow up" : null,
  nextStepDue,
});

describe("dashboard summary", () => {
  it("counts only non-empty statuses, in board order", () => {
    const board = emptyBoard();
    board.interviewing.push(card("a", null));
    board.saved.push(card("b", null), card("c", null));
    expect(statusCounts(board)).toEqual([
      { status: "saved", count: 2 },
      { status: "interviewing", count: 1 },
    ]);
  });

  it("keeps next steps due today through 7 days out, soonest first", () => {
    const board = emptyBoard();
    board.applied.push(
      card("late", "2026-10-20"),
      card("past", "2026-10-12"),
      card("none", null),
      card("today", "2026-10-13"),
    );
    board.offer.push(card("far", "2026-10-21"));
    const today = new Date("2026-10-13T15:00:00Z");
    expect(upcomingSteps(board, today).map((s) => s.jobId)).toEqual([
      "job-today",
      "job-late",
    ]);
  });
});
