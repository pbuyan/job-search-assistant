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

// Lever postings are read through the public Postings API
// (https://github.com/lever/postings-api), never by scraping the board page.

// Board host → its API host (Lever's EU instance has its own).
const API_FOR_HOST: Record<string, string> = {
  "jobs.lever.co": "https://api.lever.co",
  "jobs.eu.lever.co": "https://api.eu.lever.co",
};
const SITE = /^[A-Za-z0-9_.-]{1,100}$/;
const JOB_BYTES = 2 * 1024 * 1024;
const BOARD_BYTES = 15 * 1024 * 1024;
const BOARD_LIMIT = 500;

export type LeverBoard = { site: string; api: string };
export type LeverTarget = LeverBoard & { id: string };

// The board URL of a posting, which parseLeverUrl reads back. Listings link
// to this rather than the API's hostedUrl, so importing one always goes
// through the API.
const postingUrl = (board: LeverBoard, id: string) =>
  `https://${board.api.includes(".eu.") ? "jobs.eu" : "jobs"}.lever.co/${board.site}/${id}`;

// jobs.lever.co/{site}/{id}[/apply]
export function parseLeverUrl(raw: string): LeverTarget | null {
  const url = parseHttpUrl(raw);
  const api = url && API_FOR_HOST[hostOf(url)];
  if (!url || !api) return null;
  const [site, id, rest, ...more] = url.pathname.split("/").filter(Boolean);
  if (more.length > 0 || (rest && rest !== "apply")) return null;
  return site && SITE.test(site) && id && UUID.test(id)
    ? { site, id, api }
    : null;
}

// jobs.lever.co/{site}, or any posting URL on that board.
export function parseLeverBoardUrl(raw: string): LeverBoard | null {
  const posting = parseLeverUrl(raw);
  if (posting) return { site: posting.site, api: posting.api };
  const url = parseHttpUrl(raw);
  const api = url && API_FOR_HOST[hostOf(url)];
  if (!url || !api) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  return segments.length === 1 && SITE.test(segments[0])
    ? { site: segments[0], api }
    : null;
}

const leverPostingSchema = z.object({
  id: z.string(),
  text: z.string(),
  categories: z.object({ location: z.string().nullish() }).nullish(),
  workplaceType: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  lists: z.array(z.object({ text: z.string(), content: z.string() })).nullish(),
  additionalPlain: z.string().nullish(),
  hostedUrl: z.string().nullish(),
  createdAt: z.number().nullish(),
  salaryRange: z
    .object({
      min: z.number().nullish(),
      max: z.number().nullish(),
      currency: z.string().nullish(),
      interval: z.string().nullish(),
    })
    .nullish(),
});
type LeverPosting = z.infer<typeof leverPostingSchema>;

const REMOTE: Record<string, RemoteType> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
  "on-site": "onsite",
};
const remoteOf = (p: LeverPosting) =>
  REMOTE[p.workplaceType?.toLowerCase() ?? ""] ?? null;

// Only a yearly salary maps onto the app's salary fields.
function salaryOf(p: LeverPosting): BoardPosting["salary"] {
  const s = p.salaryRange;
  if (!s?.currency || s.interval !== "per-year-salary") return null;
  if (s.min == null && s.max == null) return null;
  return {
    min: s.min ?? null,
    max: s.max ?? null,
    currency: s.currency.toUpperCase().slice(0, 3),
  };
}

// The description, each list ("Requirements", "What you'll do"…) and the
// closing section, as plain text.
function descriptionOf(p: LeverPosting): string {
  return [
    p.descriptionPlain?.trim() ?? "",
    ...(p.lists ?? []).map((l) => `${l.text.trim()}\n${htmlToText(l.content)}`),
    p.additionalPlain?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function leverPostingFromApi(
  data: unknown,
  board: LeverBoard,
): BoardPosting | null {
  const parsed = leverPostingSchema.safeParse(data);
  if (!parsed.success) return null;
  const p = parsed.data;
  const description = descriptionOf(p);
  if (!description || !p.text.trim()) return null;
  return {
    externalId: p.id,
    title: p.text.trim(),
    company: null,
    location: p.categories?.location?.trim() || null,
    remote: remoteOf(p),
    salary: salaryOf(p),
    url: httpUrl(p.hostedUrl) ?? postingUrl(board, p.id),
    postedAt: toDate(p.createdAt),
    language: null,
    description,
  };
}

export async function importLeverJob(
  target: LeverTarget,
): Promise<
  { ok: true; posting: BoardPosting } | { ok: false; error: BoardImportError }
> {
  const result = await fetchBoardJson(
    `${target.api}/v0/postings/${encodeURIComponent(target.site)}/${target.id}?mode=json`,
    JOB_BYTES,
  );
  if (!result.ok)
    return {
      ok: false,
      error: result.error === "notFound" ? "postingGone" : "boardUnavailable",
    };
  const posting = leverPostingFromApi(result.data, target);
  return posting
    ? { ok: true, posting }
    : { ok: false, error: "boardUnavailable" };
}

export async function listLeverBoard(
  board: LeverBoard,
): Promise<
  | { ok: true; postings: BoardListing[] }
  | { ok: false; error: "notFound" | "failed" }
> {
  const result = await fetchBoardJson(
    `${board.api}/v0/postings/${encodeURIComponent(board.site)}?mode=json&limit=${BOARD_LIMIT}`,
    BOARD_BYTES,
  );
  if (!result.ok) return result;
  const parsed = z.array(z.unknown()).safeParse(result.data);
  if (!parsed.success) return { ok: false, error: "failed" };
  const postings = parsed.data.flatMap((item) => {
    const p = leverPostingSchema.safeParse(item);
    if (!p.success || !p.data.text.trim()) return [];
    return [
      {
        externalId: p.data.id,
        title: p.data.text.trim(),
        location: p.data.categories?.location?.trim() || null,
        remote: remoteOf(p.data),
        url: postingUrl(board, p.data.id),
        postedAt: toDate(p.data.createdAt),
      },
    ];
  });
  return { ok: true, postings };
}
