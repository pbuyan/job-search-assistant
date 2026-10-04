import { parse, type HTMLElement } from "node-html-parser";

export const MAX_POSTING_CHARS = 60_000;
const MIN_PASTED_CHARS = 200;
const MIN_PAGE_CHARS = 300;

export type PostingTextError = "tooShort" | "tooLong" | "needsPaste";

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const htmlToText = (html: string) => tidy(parse(html).structuredText);

export function postingFromPaste(
  text: string,
): { ok: true; text: string } | { ok: false; error: "tooShort" | "tooLong" } {
  const clean = tidy(text);
  if (clean.length < MIN_PASTED_CHARS) return { ok: false, error: "tooShort" };
  if (clean.length > MAX_POSTING_CHARS) return { ok: false, error: "tooLong" };
  return { ok: true, text: clean };
}

type JsonLd = Record<string, unknown>;

function isJobPosting(node: JsonLd): boolean {
  const type = node["@type"];
  return (
    type === "JobPosting" ||
    (Array.isArray(type) && type.includes("JobPosting"))
  );
}

function findJobPosting(value: unknown): JsonLd | null {
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findJobPosting(v);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const node = value as JsonLd;
    if (isJobPosting(node)) return node;
    if (node["@graph"]) return findJobPosting(node["@graph"]);
  }
  return null;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function locationOf(posting: JsonLd): string {
  const locs = Array.isArray(posting.jobLocation)
    ? posting.jobLocation
    : [posting.jobLocation];
  const parts = locs
    .map((l) => (l && typeof l === "object" ? (l as JsonLd).address : null))
    .filter((a): a is JsonLd => !!a && typeof a === "object")
    .map((a) =>
      [str(a.addressLocality), str(a.addressRegion), str(a.addressCountry)]
        .filter(Boolean)
        .join(", "),
    )
    .filter(Boolean);
  if (str(posting.jobLocationType) === "TELECOMMUTE") parts.push("Remote");
  return parts.join(" / ");
}

// schema.org JobPosting markup is what most career sites (and every major
// ATS) embed for search engines; it's cleaner than the page text.
function fromJsonLd(root: HTMLElement): string | null {
  for (const script of root.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    let data: unknown;
    try {
      data = JSON.parse(script.rawText);
    } catch {
      continue;
    }
    const posting = findJobPosting(data);
    if (!posting) continue;
    const org = posting.hiringOrganization;
    const company =
      org && typeof org === "object" ? str((org as JsonLd).name) : str(org);
    const description = htmlToText(str(posting.description));
    if (!description) continue;
    const header = [
      ["Title", str(posting.title)],
      ["Company", company],
      ["Location", locationOf(posting)],
      ["Employment type", str(posting.employmentType)],
    ]
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`);
    return tidy([...header, "", description].join("\n"));
  }
  return null;
}

function fromPageText(root: HTMLElement): string {
  root
    .querySelectorAll(
      "script, style, noscript, template, svg, nav, header, footer, form, iframe",
    )
    .forEach((n) => n.remove());
  const main =
    root.querySelector("main") ??
    root.querySelector("article") ??
    root.querySelector("body") ??
    root;
  return tidy(main.structuredText);
}

export function postingFromHtml(
  html: string,
):
  | { ok: true; text: string; via: "jsonld" | "page" }
  | { ok: false; error: PostingTextError } {
  const root = parse(html);
  const structured = fromJsonLd(root);
  if (
    structured &&
    structured.length >= MIN_PASTED_CHARS &&
    structured.length <= MAX_POSTING_CHARS
  ) {
    return { ok: true, text: structured, via: "jsonld" };
  }
  // Client-rendered pages and huge pages full of navigation both end up here:
  // ask the user to paste rather than guess or silently cut.
  const text = fromPageText(root);
  if (text.length < MIN_PAGE_CHARS || text.length > MAX_POSTING_CHARS) {
    return { ok: false, error: "needsPaste" };
  }
  return { ok: true, text, via: "page" };
}
