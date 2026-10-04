// Pure board helpers shared by the kanban (client) and its tests. Kept free of
// server imports so the client bundle doesn't pull in Drizzle.

// Mirrors the application_status pg enum (checked against it in
// src/db/queries/applications.ts), in board column order.
export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
  "ghosted",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type BoardCard = {
  id: string;
  jobId: string;
  company: string;
  title: string;
  score: number | null;
  nextStep: string | null;
  nextStepDue: string | null; // YYYY-MM-DD (date column)
};

export type Board = Record<ApplicationStatus, BoardCard[]>;

export const columnId = (status: ApplicationStatus) => `column:${status}`;

export function isStatus(value: unknown): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly unknown[]).includes(value);
}

export function emptyBoard(): Board {
  return Object.fromEntries(
    APPLICATION_STATUSES.map((s) => [s, []]),
  ) as unknown as Board;
}

// The column holding `id`, where `id` is either a card id or a column id.
export function findColumn(board: Board, id: string): ApplicationStatus | null {
  if (id.startsWith("column:")) {
    const status = id.slice("column:".length);
    return isStatus(status) ? status : null;
  }
  return (
    APPLICATION_STATUSES.find((s) => board[s].some((c) => c.id === id)) ?? null
  );
}

// Moves card `activeId` to where `overId` (a card or a column) is. Dropping on
// a column appends; dropping on a card takes that card's place. Returns the
// same board object when nothing changes.
export function moveCard(board: Board, activeId: string, overId: string): Board {
  const from = findColumn(board, activeId);
  const to = findColumn(board, overId);
  if (!from || !to) return board;
  const fromIndex = board[from].findIndex((c) => c.id === activeId);
  const card = board[from][fromIndex];
  const overIndex = board[to].findIndex((c) => c.id === overId);

  if (from === to) {
    if (overIndex < 0 || overIndex === fromIndex) return board;
    const cards = [...board[from]];
    cards.splice(fromIndex, 1);
    cards.splice(overIndex, 0, card);
    return { ...board, [from]: cards };
  }

  const target = [...board[to]];
  target.splice(overIndex < 0 ? target.length : overIndex, 0, card);
  return {
    ...board,
    [from]: board[from].filter((c) => c.id !== activeId),
    [to]: target,
  };
}

// Final order of a column after inserting `movedId` at `index` among the
// other cards (server side, where the column is re-read inside a transaction).
export function placeInColumn(
  otherIds: string[],
  movedId: string,
  index: number,
): string[] {
  const ids = otherIds.filter((id) => id !== movedId);
  ids.splice(Math.max(0, Math.min(index, ids.length)), 0, movedId);
  return ids;
}
