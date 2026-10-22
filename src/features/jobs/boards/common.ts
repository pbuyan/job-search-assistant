// Shared by the Greenhouse, Lever and Ashby importers: the posting shape they
// produce and the one way they call a public board API. Nothing here logs
// posting content.

export type RemoteType = "onsite" | "hybrid" | "remote";

// One posting from a board API. Fields the board doesn't provide are null and
// filled in by the AI extraction instead (board data wins when present).
export type BoardPosting = {
  externalId: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: RemoteType | null;
  salary: { min: number | null; max: number | null; currency: string } | null;
  url: string;
  postedAt: Date | null;
  language: string | null;
  description: string;
};

// Why importing one posting failed: it's gone (404, unlisted), or the board
// API couldn't be read, in which case the user can paste the text instead.
export type BoardImportError = "postingGone" | "boardUnavailable";

// A row of a board listing: enough to choose what to import.
export type BoardListing = {
  externalId: string;
  title: string;
  location: string | null;
  remote: RemoteType | null;
  url: string;
  postedAt: Date | null;
};

export const USER_AGENT =
  "JobSearchAssistant/0.1 (user-initiated import of public job postings)";
const TIMEOUT_MS = 10_000;

// GET a board API URL and parse its JSON. Redirects are refused (the URL is
// built from an allow-listed host) and the body is capped, both in the
// declared length and in what's actually read.
export async function fetchBoardJson(
  url: string,
  maxBytes: number,
): Promise<
  { ok: true; data: unknown } | { ok: false; error: "notFound" | "failed" }
> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return { ok: false, error: "notFound" };
    if (!res.ok) return { ok: false, error: "failed" };
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes)
      return { ok: false, error: "failed" };
    const body = await res.text();
    if (body.length > maxBytes) return { ok: false, error: "failed" };
    return { ok: true, data: JSON.parse(body) };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export function toDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const httpUrl = (value: string | null | undefined) =>
  value && URL.canParse(value) && /^https?:\/\//i.test(value) ? value : null;

// A URL the user typed, or null when it isn't an http(s) URL.
export function parseHttpUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url;
}

export const hostOf = (url: URL) =>
  url.hostname.toLowerCase().replace(/\.$/, "");

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
