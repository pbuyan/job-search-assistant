import {
  importAshbyJob,
  parseAshbyUrl,
  type AshbyBoardCache,
} from "./boards/ashby";
import type { BoardPosting } from "./boards/common";
import { importLeverJob, parseLeverUrl } from "./boards/lever";
import { importGreenhouseJob, parseGreenhouseUrl } from "./greenhouse";

// Whether a board posting is still open, read again from its board's public
// API. Only "closed" is ever written as closed: a board that can't be reached
// (or a URL that can't be read back) says nothing about the posting.
export type PostingCheck =
  | { state: "open"; posting: BoardPosting }
  | { state: "closed" }
  | { state: "unavailable" }
  | { state: "unsupported" };

export type CheckableJob = { source: string; url: string | null };

export const BOARD_SOURCES = ["greenhouse", "lever", "ashby"] as const;

export async function checkPosting(
  job: CheckableJob,
  ashbyBoards?: AshbyBoardCache,
): Promise<PostingCheck> {
  if (!job.url) return { state: "unsupported" };
  let result:
    { ok: true; posting: BoardPosting } | { ok: false; error: string };
  if (job.source === "greenhouse") {
    const target = parseGreenhouseUrl(job.url);
    if (!target) return { state: "unsupported" };
    // A career-page URL (gh_jid only) reports a 404 as "needsPaste", since
    // the board token was guessed from the page: never as closed.
    result = await importGreenhouseJob(target);
  } else if (job.source === "lever") {
    const target = parseLeverUrl(job.url);
    if (!target) return { state: "unsupported" };
    result = await importLeverJob(target);
  } else if (job.source === "ashby") {
    const target = parseAshbyUrl(job.url);
    if (!target) return { state: "unsupported" };
    result = await importAshbyJob(target, ashbyBoards);
  } else {
    return { state: "unsupported" };
  }
  if (result.ok) return { state: "open", posting: result.posting };
  return result.error === "postingGone"
    ? { state: "closed" }
    : { state: "unavailable" };
}

// The text a board posting is parsed from: its header fields, then the
// description. Used on import and when a refreshed posting has changed.
export function boardPostingText(board: BoardPosting): string {
  return [
    ["Title", board.title],
    ["Company", board.company],
    ["Location", board.location],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .concat("", board.description)
    .join("\n");
}

// Whitespace-only edits don't count as a changed posting (and don't cost a
// new parse).
export const sameDescription = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
