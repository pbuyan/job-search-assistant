import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ApplicationCard } from "@/components/tracker/application-card";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import {
  APPLICATION_STATUSES,
  columnId,
  emptyBoard,
  findColumn,
  moveCard,
  placeInColumn,
  type BoardCard,
} from "./board";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => (
    <a href={href} {...props} />
  ),
}));

const card = (id: string, extra: Partial<BoardCard> = {}): BoardCard => ({
  id,
  jobId: `job-${id}`,
  company: "Acme",
  title: `Job ${id}`,
  score: null,
  nextStep: null,
  nextStepDue: null,
  ...extra,
});

function boardWith() {
  const board = emptyBoard();
  board.saved = [card("a"), card("b"), card("c")];
  board.applied = [card("d")];
  return board;
}

const ids = (cards: BoardCard[]) => cards.map((c) => c.id);

describe("board helpers", () => {
  it("has a column per status", () => {
    expect(Object.keys(emptyBoard())).toEqual([...APPLICATION_STATUSES]);
  });

  it("finds the column of a card or column id", () => {
    const board = boardWith();
    expect(findColumn(board, "d")).toBe("applied");
    expect(findColumn(board, columnId("offer"))).toBe("offer");
    expect(findColumn(board, "column:nope")).toBeNull();
    expect(findColumn(board, "missing")).toBeNull();
  });

  it("reorders within a column", () => {
    const next = moveCard(boardWith(), "a", "c");
    expect(ids(next.saved)).toEqual(["b", "c", "a"]);
  });

  it("moves onto a card in another column, taking its place", () => {
    const next = moveCard(boardWith(), "b", "d");
    expect(ids(next.saved)).toEqual(["a", "c"]);
    expect(ids(next.applied)).toEqual(["b", "d"]);
  });

  it("appends when dropped on a column", () => {
    const next = moveCard(boardWith(), "a", columnId("applied"));
    expect(ids(next.applied)).toEqual(["d", "a"]);
    const empty = moveCard(boardWith(), "a", columnId("ghosted"));
    expect(ids(empty.ghosted)).toEqual(["a"]);
  });

  it("returns the same board for no-op or unknown moves", () => {
    const board = boardWith();
    expect(moveCard(board, "a", "a")).toBe(board);
    expect(moveCard(board, "zzz", "a")).toBe(board);
  });

  it("places the moved id at a clamped index", () => {
    expect(placeInColumn(["x", "y"], "m", 1)).toEqual(["x", "m", "y"]);
    expect(placeInColumn(["x", "y"], "m", 99)).toEqual(["x", "y", "m"]);
    expect(placeInColumn(["x", "m", "y"], "m", 0)).toEqual(["m", "x", "y"]);
  });
});

describe("ApplicationCard", () => {
  const full = card("a", {
    company: "Banque Laurentienne du Québec et des Territoires",
    title: "Développeuse principale d'applications infonuagiques",
    score: 72,
    nextStep: "Entrevue technique avec l'équipe",
    nextStepDue: "2026-11-05",
  });

  it("formats the due date per locale without shifting the day", () => {
    const { unmount } = render(
      <NextIntlClientProvider locale="fr" messages={fr} timeZone="America/Vancouver">
        <ApplicationCard card={full} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Adéquation 72")).toBeInTheDocument();
    expect(screen.getByText(/échéance le 5 nov\. 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/jobs/job-a");
    unmount();

    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="America/Vancouver">
        <ApplicationCard card={full} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/due Nov 5, 2026/)).toBeInTheDocument();
  });

  it("shows when there is no fit score and hides an empty next step", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ApplicationCard card={card("b")} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Not analyzed")).toBeInTheDocument();
    expect(screen.queryByText(/due/)).toBeNull();
  });
});
