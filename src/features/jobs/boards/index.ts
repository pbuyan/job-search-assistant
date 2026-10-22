import { listGreenhouseBoard, parseGreenhouseBoardUrl } from "../greenhouse";
import {
  importAshbyJob,
  listAshbyBoard,
  parseAshbyBoardUrl,
  parseAshbyUrl,
} from "./ashby";
import type { BoardImportError, BoardListing, BoardPosting } from "./common";
import {
  importLeverJob,
  listLeverBoard,
  parseLeverBoardUrl,
  parseLeverUrl,
} from "./lever";

export type BoardProvider = "greenhouse" | "lever" | "ashby";

export type BoardRef =
  | { provider: "greenhouse"; board: string }
  | { provider: "lever"; board: string; api: string }
  | { provider: "ashby"; board: string };

// A company's board from its URL (or any posting URL on it), on one of the
// allowed public board APIs.
export function parseBoardUrl(raw: string): BoardRef | null {
  const greenhouse = parseGreenhouseBoardUrl(raw);
  if (greenhouse) return { provider: "greenhouse", board: greenhouse };
  const lever = parseLeverBoardUrl(raw);
  if (lever) return { provider: "lever", board: lever.site, api: lever.api };
  const ashby = parseAshbyBoardUrl(raw);
  if (ashby) return { provider: "ashby", board: ashby.board };
  return null;
}

export type BoardListResult =
  | { ok: true; company: string | null; postings: BoardListing[] }
  | { ok: false; error: "notFound" | "failed" };

export async function listBoard(ref: BoardRef): Promise<BoardListResult> {
  if (ref.provider === "greenhouse") return listGreenhouseBoard(ref.board);
  const result =
    ref.provider === "lever"
      ? await listLeverBoard({ site: ref.board, api: ref.api })
      : await listAshbyBoard({ board: ref.board });
  // Lever and Ashby don't name the company; the page falls back to the board.
  return result.ok ? { ...result, company: null } : result;
}

// Lever and Ashby posting URLs. Greenhouse has its own path in createJob,
// since its postings also appear on company career pages.
export function importerFor(raw: string): {
  source: "lever" | "ashby";
  run: () => Promise<
    { ok: true; posting: BoardPosting } | { ok: false; error: BoardImportError }
  >;
} | null {
  const lever = parseLeverUrl(raw);
  if (lever) return { source: "lever", run: () => importLeverJob(lever) };
  const ashby = parseAshbyUrl(raw);
  if (ashby) return { source: "ashby", run: () => importAshbyJob(ashby) };
  return null;
}
