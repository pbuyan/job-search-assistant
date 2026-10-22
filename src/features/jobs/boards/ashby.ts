import { z } from "zod";
import { greenhouseContentToText as htmlToText } from "../greenhouse";
import {
  fetchBoardJson,
  hostOf,
  httpUrl,
  parseHttpUrl,
  toDate,
  UUID,
  type BoardImportError,
  type BoardListing,
  type BoardPosting,
  type RemoteType,
} from "./common";

// Ashby postings are read through the public Job Postings API
// (https://developers.ashbyhq.com/docs/public-job-posting-api), never by
// scraping the board page. It has no single-posting endpoint: an import reads
// the board and picks the posting by id.

const API_BASE = "https://api.ashbyhq.com/posting-api/job-board";
const HOST = "jobs.ashbyhq.com";
// Board names are company names and may contain spaces (URL-encoded).
const BOARD = /^[A-Za-z0-9 ._-]{1,100}$/;
const BOARD_BYTES = 20 * 1024 * 1024;

export type AshbyBoard = { board: string };
export type AshbyTarget = AshbyBoard & { id: string };

function segmentsOf(raw: string): string[] | null {
  const url = parseHttpUrl(raw);
  if (!url || hostOf(url) !== HOST) return null;
  try {
    return url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
}

// jobs.ashbyhq.com/{board}/{id}[/application]
export function parseAshbyUrl(raw: string): AshbyTarget | null {
  const segments = segmentsOf(raw);
  if (!segments) return null;
  const [board, id, rest, ...more] = segments;
  if (more.length > 0 || (rest && rest !== "application")) return null;
  return board && BOARD.test(board) && id && UUID.test(id)
    ? { board, id }
    : null;
}

// jobs.ashbyhq.com/{board}, or any posting URL on that board.
export function parseAshbyBoardUrl(raw: string): AshbyBoard | null {
  const posting = parseAshbyUrl(raw);
  if (posting) return { board: posting.board };
  const segments = segmentsOf(raw);
  return segments?.length === 1 && BOARD.test(segments[0])
    ? { board: segments[0] }
    : null;
}

const postingUrl = (board: string, id: string) =>
  `https://${HOST}/${encodeURIComponent(board)}/${id}`;

const ashbyJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.string().nullish(),
  isListed: z.boolean().nullish(),
  isRemote: z.boolean().nullish(),
  workplaceType: z.string().nullish(),
  publishedAt: z.string().nullish(),
  jobUrl: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  descriptionHtml: z.string().nullish(),
  compensation: z
    .object({
      summaryComponents: z
        .array(
          z.object({
            compensationType: z.string().nullish(),
            interval: z.string().nullish(),
            currencyCode: z.string().nullish(),
            minValue: z.number().nullish(),
            maxValue: z.number().nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
});
type AshbyJob = z.infer<typeof ashbyJobSchema>;
const boardSchema = z.object({ jobs: z.array(z.unknown()) });

const REMOTE: Record<string, RemoteType> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
};
const remoteOf = (j: AshbyJob): RemoteType | null =>
  REMOTE[j.workplaceType?.toLowerCase() ?? ""] ??
  (j.isRemote ? "remote" : null);

// Only a yearly base salary maps onto the app's salary fields.
function salaryOf(j: AshbyJob): BoardPosting["salary"] {
  const s = j.compensation?.summaryComponents?.find(
    (c) => c.compensationType === "Salary" && c.interval === "1 YEAR",
  );
  if (!s?.currencyCode || (s.minValue == null && s.maxValue == null))
    return null;
  return {
    min: s.minValue ?? null,
    max: s.maxValue ?? null,
    currency: s.currencyCode.toUpperCase().slice(0, 3),
  };
}

// Unlisted postings are treated as gone: the board doesn't advertise them.
function listedJobs(data: unknown): AshbyJob[] | null {
  const board = boardSchema.safeParse(data);
  if (!board.success) return null;
  return board.data.jobs.flatMap((item) => {
    const j = ashbyJobSchema.safeParse(item);
    return j.success && j.data.isListed !== false && j.data.title.trim()
      ? [j.data]
      : [];
  });
}

export function ashbyPostingFromApi(
  job: AshbyJob,
  board: string,
): BoardPosting | null {
  const description =
    job.descriptionPlain?.trim() ||
    (job.descriptionHtml ? htmlToText(job.descriptionHtml) : "");
  if (!description) return null;
  return {
    externalId: job.id,
    title: job.title.trim(),
    company: null,
    location: job.location?.trim() || null,
    remote: remoteOf(job),
    salary: salaryOf(job),
    url: httpUrl(job.jobUrl) ?? postingUrl(board, job.id),
    postedAt: toDate(job.publishedAt),
    language: null,
    description,
  };
}

async function fetchBoard(board: string) {
  const result = await fetchBoardJson(
    `${API_BASE}/${encodeURIComponent(board)}?includeCompensation=true`,
    BOARD_BYTES,
  );
  if (!result.ok) return result;
  const jobs = listedJobs(result.data);
  return jobs
    ? { ok: true as const, jobs }
    : { ok: false as const, error: "failed" as const };
}

export async function importAshbyJob(
  target: AshbyTarget,
): Promise<
  { ok: true; posting: BoardPosting } | { ok: false; error: BoardImportError }
> {
  const board = await fetchBoard(target.board);
  if (!board.ok)
    return {
      ok: false,
      error: board.error === "notFound" ? "postingGone" : "boardUnavailable",
    };
  const job = board.jobs.find(
    (j) => j.id.toLowerCase() === target.id.toLowerCase(),
  );
  if (!job) return { ok: false, error: "postingGone" };
  const posting = ashbyPostingFromApi(job, target.board);
  return posting
    ? { ok: true, posting }
    : { ok: false, error: "boardUnavailable" };
}

export async function listAshbyBoard(
  target: AshbyBoard,
): Promise<
  | { ok: true; postings: BoardListing[] }
  | { ok: false; error: "notFound" | "failed" }
> {
  const board = await fetchBoard(target.board);
  if (!board.ok) return board;
  return {
    ok: true,
    postings: board.jobs.map((j) => ({
      externalId: j.id,
      title: j.title.trim(),
      location: j.location?.trim() || null,
      remote: remoteOf(j),
      url: postingUrl(target.board, j.id),
      postedAt: toDate(j.publishedAt),
    })),
  };
}
