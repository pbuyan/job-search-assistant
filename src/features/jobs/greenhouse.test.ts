// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import notFoundBody from "./fixtures/greenhouse-404.json";
import sample from "./fixtures/greenhouse-job.json";
import {
  boardTokenFromHtml,
  decodeEntities,
  fetchGreenhouseJob,
  greenhouseContentToText,
  importGreenhouseJob,
  parseGreenhouseUrl,
  postingFromApi,
} from "./greenhouse";

describe("parseGreenhouseUrl", () => {
  it.each([
    "https://job-boards.greenhouse.io/gitlab/jobs/8860302002",
    "https://boards.greenhouse.io/gitlab/jobs/8860302002",
    "https://job-boards.eu.greenhouse.io/gitlab/jobs/8860302002",
    "https://job-boards.greenhouse.io/gitlab/jobs/8860302002/",
    "https://job-boards.greenhouse.io/gitlab/jobs/8860302002?gh_src=abc123",
    "https://boards.greenhouse.io/gitlab/jobs/8860302002/?gh_src=x&utm_source=y#apply",
    "https://JOB-BOARDS.Greenhouse.io/gitlab/jobs/8860302002",
    "  https://boards.greenhouse.io/gitlab/jobs/8860302002  ",
    "https://boards.greenhouse.io/gitlab?gh_jid=8860302002",
    "https://boards.greenhouse.io/embed/job_app?for=gitlab&token=8860302002",
  ])("reads board and job id from %s", (url) => {
    expect(parseGreenhouseUrl(url)).toEqual({
      board: "gitlab",
      jobId: "8860302002",
    });
  });

  it("treats a career page with gh_jid as needing a board token", () => {
    expect(
      parseGreenhouseUrl(
        "https://careers.airbnb.com/positions/7789554/?gh_jid=7789554",
      ),
    ).toEqual({
      board: null,
      jobId: "7789554",
      pageUrl: "https://careers.airbnb.com/positions/7789554/?gh_jid=7789554",
    });
  });

  it.each([
    "https://job-boards.greenhouse.io/gitlab",
    "https://job-boards.greenhouse.io/gitlab/jobs/",
    "https://job-boards.greenhouse.io/gitlab/jobs/abc",
    "https://job-boards.greenhouse.io/gitlab/jobs/123/apply",
    "https://evil.greenhouse.io.example.com/gitlab/jobs/123",
    "https://greenhouse.io/gitlab/jobs/123",
    "https://example.com/careers/123",
    "https://example.com/careers?gh_jid=notanumber",
    "ftp://boards.greenhouse.io/gitlab/jobs/123",
    "not a url",
  ])("ignores %s", (url) => expect(parseGreenhouseUrl(url)).toBeNull());
});

describe("boardTokenFromHtml", () => {
  it("finds the token in an embed script or board link", () => {
    expect(
      boardTokenFromHtml(
        '<script src="https://boards.greenhouse.io/embed/job_board/js?for=airbnb"></script>',
      ),
    ).toBe("airbnb");
    expect(
      boardTokenFromHtml(
        '<iframe src="https://job-boards.greenhouse.io/embed/job_app?token=1&amp;for=acme"></iframe>',
      ),
    ).toBe("acme");
    expect(
      boardTokenFromHtml(
        '<a href="https://job-boards.greenhouse.io/acme/jobs/1">Apply</a>',
      ),
    ).toBe("acme");
  });

  it("gives up when there is no token or more than one", () => {
    expect(boardTokenFromHtml("<div id=root></div>")).toBeNull();
    expect(
      boardTokenFromHtml(
        "boards.greenhouse.io/embed/job_board/js?for=one boards.greenhouse.io/two/jobs/1",
      ),
    ).toBeNull();
  });
});

describe("content decoding", () => {
  it("decodes exactly one level of entities", () => {
    expect(decodeEntities("&lt;p&gt;A &amp;amp; B&lt;/p&gt;")).toBe(
      "<p>A &amp; B</p>",
    );
    expect(decodeEntities("&amp;nbsp;&#39;&#x27;&quot;")).toBe("&nbsp;''\"");
    expect(decodeEntities("&eacute; &#0; &bogus;")).toBe(
      "&eacute; &#0; &bogus;",
    );
  });

  it("turns encoded HTML into clean text with paragraphs and bullets", () => {
    const content =
      "&lt;h2&gt;Ce que vous ferez&lt;/h2&gt;&lt;p&gt;Concevoir nos API&amp;nbsp;de facturation &amp;amp; paiements.&lt;/p&gt;" +
      "&lt;ul&gt;&lt;li&gt;5 ans d&amp;rsquo;exp&amp;eacute;rience en TypeScript&lt;/li&gt;" +
      "&lt;li&gt;&lt;p&gt;Ma&amp;icirc;trise de PostgreSQL&lt;/p&gt;&lt;ul&gt;&lt;li&gt;pgvector&lt;/li&gt;&lt;/ul&gt;&lt;/li&gt;&lt;/ul&gt;" +
      "&lt;p&gt;Bienvenue&lt;br&gt;&#39;chez nous&#39;&lt;/p&gt;";
    expect(greenhouseContentToText(content)).toBe(
      [
        "Ce que vous ferez",
        "",
        "Concevoir nos API de facturation & paiements.",
        "",
        "- 5 ans d’expérience en TypeScript",
        "- Maîtrise de PostgreSQL",
        "  - pgvector",
        "",
        "Bienvenue",
        "'chez nous'",
      ].join("\n"),
    );
  });

  it("never lets markup through", () => {
    const content =
      "&lt;p onclick=&quot;x()&quot;&gt;Hi&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;" +
      "&lt;style&gt;p{}&lt;/style&gt;&lt;iframe src=&quot;https://x&quot;&gt;&lt;/iframe&gt;" +
      "&lt;p&gt;Example: &amp;lt;img src=x onerror=alert(2)&amp;gt;&lt;/p&gt;&lt;!-- note --&gt;";
    const text = greenhouseContentToText(content);
    expect(text).toBe("Hi\n\nExample:");
    expect(text).not.toMatch(/[<>]/);
  });

  it("converts the saved sample response", () => {
    const text = greenhouseContentToText(sample.content);
    expect(text.startsWith("GitLab is the intelligent orchestration")).toBe(
      true,
    );
    expect(text).toContain("What you'll do\n\n- Own a broad book");
    expect(text).toContain("GitLab’s EEO Policy and EEO is the Law.");
    expect(text).not.toMatch(/&[a-z]+;|&#\d+;|[<>]/i);
    expect(text).not.toMatch(/\n{3,}/);
  });
});

describe("postingFromApi", () => {
  it("maps the sample response to job fields", () => {
    expect(postingFromApi(sample, "https://fallback.example")).toMatchObject({
      externalId: "8860302002",
      title: "Account Executive - France",
      company: "GitLab",
      location: "Remote, France",
      url: "https://job-boards.greenhouse.io/gitlab/jobs/8860302002",
      postedAt: new Date("2026-10-02T11:31:50-04:00"),
      language: "en",
    });
  });

  it("falls back on missing or unsafe optional fields", () => {
    const posting = postingFromApi(
      {
        ...sample,
        absolute_url: "javascript:alert(1)",
        first_published: null,
        language: null,
        company_name: null,
      },
      "https://fallback.example/job",
    );
    expect(posting).toMatchObject({
      url: "https://fallback.example/job",
      postedAt: new Date("2026-10-15T15:24:46-04:00"),
      language: null,
      company: null,
    });
  });

  it("rejects responses that don't match the schema", () => {
    expect(postingFromApi({ id: "x" }, "https://x")).toBeNull();
    expect(postingFromApi({ ...sample, content: "" }, "https://x")).toBeNull();
  });
});

describe("Greenhouse API fetch", () => {
  afterEach(() => vi.restoreAllMocks());

  const respond = (status: number, body: unknown) =>
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );

  it("calls the public API with an identifying User-Agent", async () => {
    const fetchMock = respond(200, sample);
    const result = await fetchGreenhouseJob("gitlab", "8860302002");
    expect(result).toMatchObject({
      ok: true,
      posting: { title: sample.title },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://boards-api.greenhouse.io/v1/boards/gitlab/jobs/8860302002",
    );
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("user-agent")).toMatch(
      /^JobSearchAssistant\//,
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports a 404 as a posting that is no longer available", async () => {
    respond(404, notFoundBody);
    expect(await fetchGreenhouseJob("gitlab", "1")).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(await importGreenhouseJob({ board: "gitlab", jobId: "1" })).toEqual({
      ok: false,
      error: "postingGone",
    });
  });

  it("falls back to pasting on other failures", async () => {
    respond(500, {});
    expect(await importGreenhouseJob({ board: "gitlab", jobId: "1" })).toEqual({
      ok: false,
      error: "greenhouseUnavailable",
    });

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    expect(await importGreenhouseJob({ board: "gitlab", jobId: "1" })).toEqual({
      ok: false,
      error: "greenhouseUnavailable",
    });

    vi.restoreAllMocks();
    respond(200, { unexpected: true });
    expect(await importGreenhouseJob({ board: "gitlab", jobId: "1" })).toEqual({
      ok: false,
      error: "greenhouseUnavailable",
    });
  });
});
