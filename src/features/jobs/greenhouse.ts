import { HTMLElement, parse, TextNode, type Node } from "node-html-parser";
import { z } from "zod";
import { fetchJobPage } from "./fetch-job-page";

// Greenhouse postings are read through the public Job Board API rather than
// by scraping the board page. Nothing here logs posting content.

const API_BASE = "https://boards-api.greenhouse.io/v1/boards";
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024;
const USER_AGENT =
  "JobSearchAssistant/0.1 (user-initiated import of a single job posting)";

const GREENHOUSE_HOSTS = new Set([
  "job-boards.greenhouse.io",
  "boards.greenhouse.io",
  "job-boards.eu.greenhouse.io",
]);

const BOARD_TOKEN = /^[A-Za-z0-9_-]{1,100}$/;
const JOB_ID = /^\d{1,20}$/;

// `board` is null for a company career page that only carries `gh_jid`; the
// token then has to be found on that page before the API can be called.
export type GreenhouseTarget =
  | { board: string; jobId: string }
  | { board: null; jobId: string; pageUrl: string };

export function parseGreenhouseUrl(raw: string): GreenhouseTarget | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const ghJid = url.searchParams.get("gh_jid");
  const jidOk = ghJid !== null && JOB_ID.test(ghJid);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");

  if (GREENHOUSE_HOSTS.has(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    // /{board}/jobs/{id}
    if (
      segments.length === 3 &&
      segments[1] === "jobs" &&
      BOARD_TOKEN.test(segments[0]) &&
      JOB_ID.test(segments[2])
    ) {
      return { board: segments[0], jobId: segments[2] };
    }
    // /{board}?gh_jid={id}
    if (segments.length === 1 && BOARD_TOKEN.test(segments[0]) && jidOk) {
      return { board: segments[0], jobId: ghJid };
    }
    // /embed/job_app?for={board}&token={id}
    const forParam = url.searchParams.get("for");
    const token = url.searchParams.get("token");
    if (
      segments.join("/") === "embed/job_app" &&
      forParam &&
      BOARD_TOKEN.test(forParam) &&
      token &&
      JOB_ID.test(token)
    ) {
      return { board: forParam, jobId: token };
    }
    return null;
  }

  return jidOk ? { board: null, jobId: ghJid, pageUrl: url.toString() } : null;
}

// Career pages that embed a Greenhouse board reference its token in the embed
// script or iframe URL. Only an unambiguous single token is trusted.
export function boardTokenFromHtml(html: string): string | null {
  const patterns = [
    /greenhouse\.io\/embed\/job_(?:board|app)(?:\/js)?\?(?:[^"'\s<>]*?&(?:amp;)?)?for=([A-Za-z0-9_-]+)/gi,
    /boards-api\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9_-]+)/gi,
    /(?:job-boards(?:\.eu)?|boards)\.greenhouse\.io\/(?!embed\/)([A-Za-z0-9_-]+)\/jobs\//gi,
  ];
  const tokens = new Set<string>();
  for (const pattern of patterns)
    for (const m of html.matchAll(pattern)) tokens.add(m[1].toLowerCase());
  return tokens.size === 1 ? [...tokens][0] : null;
}

// ---------- Content conversion ----------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

// One level of entity decoding, in a single pass so `&amp;nbsp;` becomes
// `&nbsp;` (still an entity, decoded later by the HTML parser) and not a space.
// Unknown named entities are left as-is for the same reason.
export function decodeEntities(input: string): string {
  return input.replace(
    /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+);/gi,
    (match, body: string) => {
      if (body[0] === "#") {
        const code =
          body[1] === "x" || body[1] === "X"
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
          ? String.fromCodePoint(code)
          : match;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    },
  );
}

const DROPPED_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "form",
  "button",
  "select",
  "textarea",
  "img",
  "video",
  "audio",
  "head",
]);
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "aside",
  "main",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "dl",
  "dt",
  "dd",
  "table",
  "tr",
  "blockquote",
  "pre",
  "hr",
  "figure",
]);

// List nesting is written as tabs: collapsed text whitespace never contains
// one, so they survive until `tidyLines` turns them into indentation.
function render(node: Node, depth: number, out: string[]): void {
  if (node instanceof TextNode) {
    out.push(node.text.replace(/\s+/g, " "));
    return;
  }
  if (!(node instanceof HTMLElement)) return; // comments
  const tag = node.tagName?.toLowerCase() ?? "";
  if (DROPPED_TAGS.has(tag)) return;
  if (tag === "br") {
    out.push("\n");
    return;
  }
  if (tag === "li") {
    const inner: string[] = [];
    for (const child of node.childNodes) render(child, depth, inner);
    const content = inner
      .join("")
      .trim()
      .replace(/\n{2,}/g, "\n");
    out.push(`\n${"\t".repeat(Math.max(depth - 1, 0))}- ${content}`);
    return;
  }
  const isList = tag === "ul" || tag === "ol";
  const isBlock = BLOCK_TAGS.has(tag) || tag === "td" || tag === "th";
  if (isBlock) out.push("\n\n");
  for (const child of node.childNodes)
    render(child, isList ? depth + 1 : depth, out);
  if (isBlock) out.push("\n\n");
}

function tidyLines(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const [, lead, rest] = /^([\t ]*)(.*)$/.exec(line)!;
      const content = rest.replace(/ {2,}/g, " ").trim();
      const indent = (lead.match(/\t/g) ?? []).length;
      return content ? "  ".repeat(indent) + content : "";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Greenhouse `content` is entity-encoded HTML. It's treated as untrusted
// input, never as markup: tags are dropped by walking the parsed tree, and
// anything tag-shaped left in the text (e.g. an encoded `<script>` example)
// plus control characters are stripped, so only plain text is stored.
export function greenhouseContentToText(content: string): string {
  const html = content.includes("<") ? content : decodeEntities(content);
  const out: string[] = [];
  render(parse(html, { comment: false }), 0, out);
  return tidyLines(
    out
      .join("")
      .replace(/ /g, " ")
      .replace(/<\/?[a-z][^>]*>/gi, "")
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​﻿]/g, ""),
  );
}

// ---------- API ----------

const greenhouseJobSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string(),
  company_name: z.string().nullish(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  absolute_url: z.string().nullish(),
  updated_at: z.string().nullish(),
  first_published: z.string().nullish(),
  language: z.string().nullish(),
  content: z.string(),
});

export type GreenhousePosting = {
  externalId: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  postedAt: Date | null;
  language: string | null;
  description: string;
};

export type GreenhouseFetchResult =
  | { ok: true; posting: GreenhousePosting }
  | { ok: false; error: "notFound" | "failed" };

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const httpUrl = (value: string | null | undefined) =>
  value && URL.canParse(value) && /^https?:\/\//i.test(value) ? value : null;

export function postingFromApi(
  data: unknown,
  fallbackUrl: string,
): GreenhousePosting | null {
  const parsed = greenhouseJobSchema.safeParse(data);
  if (!parsed.success) return null;
  const job = parsed.data;
  const description = greenhouseContentToText(job.content);
  if (!description) return null;
  const language = job.language?.trim().toLowerCase().slice(0, 2);
  return {
    externalId: String(job.id),
    title: job.title.trim(),
    company: job.company_name?.trim() || null,
    location: job.location?.name?.trim() || null,
    url: httpUrl(job.absolute_url) ?? fallbackUrl,
    postedAt: toDate(job.first_published) ?? toDate(job.updated_at),
    language: language && /^[a-z]{2}$/.test(language) ? language : null,
    description,
  };
}

export async function fetchGreenhouseJob(
  board: string,
  jobId: string,
): Promise<GreenhouseFetchResult> {
  if (!BOARD_TOKEN.test(board) || !JOB_ID.test(jobId))
    return { ok: false, error: "failed" };
  const apiUrl = `${API_BASE}/${encodeURIComponent(board)}/jobs/${jobId}`;
  try {
    const res = await fetch(apiUrl, {
      method: "GET",
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return { ok: false, error: "notFound" };
    if (!res.ok) return { ok: false, error: "failed" };
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES)
      return { ok: false, error: "failed" };
    const body = await res.text();
    if (body.length > MAX_BYTES) return { ok: false, error: "failed" };
    const posting = postingFromApi(
      JSON.parse(body),
      `https://job-boards.greenhouse.io/${board}/jobs/${jobId}`,
    );
    return posting ? { ok: true, posting } : { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export type GreenhouseImportError =
  "postingGone" | "greenhouseUnavailable" | "needsPaste";

// A 404 for a token read off a career page may just mean the guess was wrong,
// so only a token taken from a Greenhouse URL reports the posting as gone.
export async function importGreenhouseJob(
  target: GreenhouseTarget,
): Promise<
  | { ok: true; posting: GreenhousePosting }
  | { ok: false; error: GreenhouseImportError }
> {
  let board = target.board;
  if (target.board === null) {
    const page = await fetchJobPage(target.pageUrl);
    board = page.ok ? boardTokenFromHtml(page.html) : null;
  }
  if (!board) return { ok: false, error: "needsPaste" };
  const result = await fetchGreenhouseJob(board, target.jobId);
  if (result.ok) return result;
  if (result.error === "notFound")
    return {
      ok: false,
      error: target.board === null ? "needsPaste" : "postingGone",
    };
  return { ok: false, error: "greenhouseUnavailable" };
}
