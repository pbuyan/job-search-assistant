import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import zlib from "node:zlib";

// Server-side fetch of a user-pasted job URL. The URL is untrusted, so this
// guards against SSRF: only http(s) on default ports, every resolved address
// is checked at connect time (so DNS rebinding can't swap in an internal
// address after a check), redirects are followed manually and re-checked,
// and size and time are capped.

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const USER_AGENT =
  "JobSearchAssistant/0.1 (user-initiated fetch of a single job posting)";

// Sites whose terms forbid automated access (CLAUDE.md, Job sourcing). Matched
// on any hostname label so country domains (ca.indeed.com, indeed.fr) count.
const BLOCKED_SITE_LABELS = new Set(["linkedin", "indeed", "glassdoor"]);

// Separate lists: a BlockList also matches IPv4 addresses against
// IPv4-mapped IPv6 rules, so mixing them would block all of IPv4.
const blockedV4 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blockedV4.addSubnet(net, prefix, "ipv4");
const blockedV6 = new BlockList();
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blockedV6.addSubnet(net, prefix, "ipv6");

// ::ffff:a.b.c.d and ::ffff:XXXX:XXXX are IPv4 addresses in IPv6 form.
function mappedIPv4(address: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!hex) return null;
  const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockedV4.check(address, "ipv4");
  if (family === 6) {
    const v4 = mappedIPv4(address);
    return v4 ? blockedV4.check(v4, "ipv4") : blockedV6.check(address, "ipv6");
  }
  return true;
}

export function isBlockedSite(hostname: string): boolean {
  return hostname
    .toLowerCase()
    .split(".")
    .some((label) => BLOCKED_SITE_LABELS.has(label));
}

export type FetchError =
  | "invalidUrl"
  | "blockedSite"
  | "blockedAddress"
  | "httpError"
  | "notHtml"
  | "tooLarge"
  | "timeout"
  | "fetchFailed";

export type FetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: FetchError };

class FetchFailure extends Error {
  constructor(readonly code: FetchError) {
    super(code);
  }
}

export function checkUrl(raw: string): URL | FetchError {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalidUrl";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return "invalidUrl";
  if (url.username || url.password) return "invalidUrl";
  if (url.port && url.port !== "80" && url.port !== "443") return "invalidUrl";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedSite(host)) return "blockedSite";
  // Node skips `lookup` for IP literals, so check those here.
  if (isIP(host) && isBlockedAddress(host)) return "blockedAddress";
  return url;
}

// Resolves like dns.lookup but refuses to hand any blocked address to the
// socket. Rejects the whole host if any of its addresses is blocked.
function safeLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    if (
      addresses.length === 0 ||
      addresses.some((a) => isBlockedAddress(a.address))
    ) {
      return callback(new FetchFailure("blockedAddress"), []);
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

function charsetOf(contentType: string): string {
  const m = /charset=([^;]+)/i.exec(contentType);
  return m ? m[1].trim().replace(/^"|"$/g, "") : "utf-8";
}

function decoderFor(charset: string): TextDecoder {
  try {
    return new TextDecoder(charset);
  } catch {
    return new TextDecoder("utf-8");
  }
}

function requestOnce(url: URL, signal: AbortSignal) {
  return new Promise<
    { kind: "redirect"; location: string } | { kind: "html"; html: string }
  >((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: safeLookup as never,
        signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
          "accept-encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ kind: "redirect", location: res.headers.location });
        }
        if (status !== 200) {
          res.resume();
          return reject(new FetchFailure("httpError"));
        }
        const type = String(res.headers["content-type"] ?? "");
        if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
          res.resume();
          return reject(new FetchFailure("notHtml"));
        }

        const encoding = String(
          res.headers["content-encoding"] ?? "",
        ).toLowerCase();
        const body =
          encoding === "gzip"
            ? res.pipe(zlib.createGunzip())
            : encoding === "deflate"
              ? res.pipe(zlib.createInflate())
              : encoding === "br"
                ? res.pipe(zlib.createBrotliDecompress())
                : res;

        const chunks: Buffer[] = [];
        let size = 0; // counted after decompression, so a zip bomb is capped too
        body.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            reject(new FetchFailure("tooLarge"));
            return;
          }
          chunks.push(chunk);
        });
        body.on("end", () =>
          resolve({
            kind: "html",
            html: decoderFor(charsetOf(type)).decode(Buffer.concat(chunks)),
          }),
        );
        body.on("error", () => reject(new FetchFailure("fetchFailed")));
      },
    );
    req.on("error", (err) => {
      if (err instanceof FetchFailure) return reject(err);
      reject(new FetchFailure(signal.aborted ? "timeout" : "fetchFailed"));
    });
    req.end();
  });
}

export async function fetchJobPage(rawUrl: string): Promise<FetchResult> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = rawUrl;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const checked = checkUrl(current);
      if (typeof checked === "string") return { ok: false, error: checked };
      const res = await requestOnce(checked, signal);
      if (res.kind === "html")
        return { ok: true, html: res.html, finalUrl: checked.toString() };
      current = new URL(res.location, checked).toString();
    }
    return { ok: false, error: "fetchFailed" }; // too many redirects
  } catch (err) {
    if (err instanceof FetchFailure) return { ok: false, error: err.code };
    return { ok: false, error: signal.aborted ? "timeout" : "fetchFailed" };
  }
}
