// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postingFromHtml, postingFromPaste } from "./extract-job-text";
import {
  checkUrl,
  fetchJobPage,
  isBlockedAddress,
  isBlockedSite,
} from "./fetch-job-page";

describe("SSRF guards", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each([
    "8.8.8.8",
    "151.101.1.69",
    "::ffff:8.8.8.8",
    "2606:4700::6810:85e5",
  ])("allows %s", (ip) => expect(isBlockedAddress(ip)).toBe(false));

  it("rejects non-http schemes, credentials, odd ports and IP literals in private ranges", () => {
    expect(checkUrl("file:///etc/passwd")).toBe("invalidUrl");
    expect(checkUrl("ftp://example.com/job")).toBe("invalidUrl");
    expect(checkUrl("https://user:pw@example.com/job")).toBe("invalidUrl");
    expect(checkUrl("http://example.com:8080/job")).toBe("invalidUrl");
    expect(checkUrl("http://169.254.169.254/latest/meta-data")).toBe(
      "blockedAddress",
    );
    expect(checkUrl("http://[::1]/")).toBe("blockedAddress");
    expect(checkUrl("https://example.com/careers/123")).toBeInstanceOf(URL);
  });

  it("blocks job sites whose terms forbid automated access, including country domains", () => {
    expect(isBlockedSite("www.linkedin.com")).toBe(true);
    expect(isBlockedSite("ca.indeed.com")).toBe(true);
    expect(isBlockedSite("indeed.fr")).toBe(true);
    expect(isBlockedSite("www.glassdoor.ca")).toBe(true);
    expect(isBlockedSite("boards.greenhouse.io")).toBe(false);
    expect(checkUrl("https://www.linkedin.com/jobs/view/1")).toBe(
      "blockedSite",
    );
  });

  describe("against a real local server", () => {
    let server: http.Server;
    let hits = 0;
    beforeAll(async () => {
      server = http.createServer((_req, res) => {
        hits++;
        res
          .writeHead(200, { "content-type": "text/html" })
          .end("<p>internal</p>");
      });
      await new Promise<void>((r) =>
        server.listen(80, "127.0.0.1", r).on("error", () => r()),
      );
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it("never connects to a hostname that resolves to loopback", async () => {
      expect(await fetchJobPage("http://localhost/")).toEqual({
        ok: false,
        error: "blockedAddress",
      });
      expect(await fetchJobPage("http://127.0.0.1/")).toEqual({
        ok: false,
        error: "blockedAddress",
      });
      const port = (server.address() as AddressInfo | null)?.port;
      if (port)
        expect(await fetchJobPage(`http://127.0.0.1:${port}/`)).toMatchObject({
          ok: false,
        });
      expect(hits).toBe(0);
    });
  });
});

const jsonLdPage = `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "Ignored" },
    {
      "@type": "JobPosting",
      title: "Développeuse backend",
      hiringOrganization: { "@type": "Organization", name: "Boréale Inc." },
      jobLocation: {
        "@type": "Place",
        address: {
          addressLocality: "Montréal",
          addressRegion: "QC",
          addressCountry: "CA",
        },
      },
      employmentType: "FULL_TIME",
      description:
        "<p>Nous cherchons une développeuse backend.</p><ul><li>5 ans d'expérience en TypeScript</li><li>Maîtrise de PostgreSQL</li><li>Atout : Kubernetes</li></ul><p>Vous concevrez nos API de facturation et travaillerez avec l'équipe produit sur de nouvelles fonctionnalités.</p>",
    },
  ],
})}</script></head>
<body><nav>Accueil Emplois Connexion</nav><main>App shell</main></body></html>`;

describe("posting extraction", () => {
  it("prefers schema.org JobPosting data and keeps the original language", () => {
    const result = postingFromHtml(jsonLdPage);
    expect(result).toMatchObject({ ok: true, via: "jsonld" });
    if (!result.ok) return;
    expect(result.text).toContain("Title: Développeuse backend");
    expect(result.text).toContain("Company: Boréale Inc.");
    expect(result.text).toContain("Location: Montréal, QC, CA");
    expect(result.text).toContain("5 ans d'expérience en TypeScript");
    expect(result.text).not.toContain("<li>");
    expect(result.text).not.toContain("Accueil");
  });

  it("falls back to page text without navigation, scripts or styles", () => {
    const body = "Senior engineer. ".repeat(30);
    const html = `<html><body><header>Logo</header><nav>Menu</nav><script>track()</script>
      <style>.x{}</style><main><h1>Senior Engineer</h1><p>${body}</p></main><footer>©</footer></body></html>`;
    const result = postingFromHtml(html);
    expect(result).toMatchObject({ ok: true, via: "page" });
    if (!result.ok) return;
    expect(result.text).toContain("Senior Engineer");
    for (const junk of ["Logo", "Menu", "track()", ".x{}", "©"])
      expect(result.text).not.toContain(junk);
  });

  it("asks for a paste when a client-rendered page has no content", () => {
    const shell = `<html><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    expect(postingFromHtml(shell)).toEqual({ ok: false, error: "needsPaste" });
  });

  it("validates pasted text length", () => {
    expect(postingFromPaste("too short")).toEqual({
      ok: false,
      error: "tooShort",
    });
    expect(postingFromPaste("x".repeat(60_001))).toEqual({
      ok: false,
      error: "tooLong",
    });
    expect(
      postingFromPaste(`  ${"Requirement line.\r\n".repeat(20)}  `),
    ).toMatchObject({ ok: true });
  });
});
