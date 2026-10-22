// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import ashbyBoard from "../fixtures/ashby-board.json";
import greenhouseBoard from "../fixtures/greenhouse-board.json";
import leverBoard from "../fixtures/lever-board.json";
import leverJob from "../fixtures/lever-job.json";
import { listGreenhouseBoard, parseGreenhouseBoardUrl } from "../greenhouse";
import { importAshbyJob, listAshbyBoard, parseAshbyUrl } from "./ashby";
import { fetchBoardJson } from "./common";
import { matchesPreferences } from "./filter";
import { importerFor, parseBoardUrl } from "./index";
import {
  importLeverJob,
  leverPostingFromApi,
  listLeverBoard,
  parseLeverBoardUrl,
  parseLeverUrl,
} from "./lever";

const LEVER_ID = "ad208490-4052-4f91-a57e-433f2d1e484b";
const ASHBY_ID = "7458d4e9-da2e-47bd-98cb-adfda43d42b2";

const respond = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    }),
  );

afterEach(() => vi.restoreAllMocks());

describe("board URLs", () => {
  it("reads Lever posting and board URLs, including the EU host", () => {
    expect(
      parseLeverUrl(`https://jobs.lever.co/leverdemo/${LEVER_ID}`),
    ).toEqual({
      site: "leverdemo",
      id: LEVER_ID,
      api: "https://api.lever.co",
    });
    expect(
      parseLeverUrl(`https://jobs.eu.lever.co/acme/${LEVER_ID}/apply`),
    ).toMatchObject({
      api: "https://api.eu.lever.co",
    });
    expect(
      parseLeverUrl(`https://jobs.lever.co/acme/${LEVER_ID}/other`),
    ).toBeNull();
    expect(
      parseLeverUrl(`https://jobs.lever.co.evil.com/acme/${LEVER_ID}`),
    ).toBeNull();
    expect(parseLeverUrl("https://jobs.lever.co/acme/not-an-id")).toBeNull();
    expect(parseLeverBoardUrl("https://jobs.lever.co/acme")).toEqual({
      site: "acme",
      api: "https://api.lever.co",
    });
  });

  it("reads Ashby URLs, decoding board names with spaces", () => {
    expect(
      parseAshbyUrl(
        `https://jobs.ashbyhq.com/Acme%20Labs/${ASHBY_ID}/application`,
      ),
    ).toEqual({
      board: "Acme Labs",
      id: ASHBY_ID,
    });
    expect(parseAshbyUrl(`ftp://jobs.ashbyhq.com/acme/${ASHBY_ID}`)).toBeNull();
    expect(parseAshbyUrl("https://jobs.ashbyhq.com/acme/%E0%A4%A")).toBeNull();
  });

  it("reads Greenhouse board URLs and finds the board of a posting", () => {
    expect(
      parseGreenhouseBoardUrl("https://job-boards.greenhouse.io/gitlab"),
    ).toBe("gitlab");
    expect(
      parseGreenhouseBoardUrl("https://boards.greenhouse.io/gitlab/jobs/123"),
    ).toBe("gitlab");
    expect(
      parseGreenhouseBoardUrl(
        "https://boards.greenhouse.io/embed/job_board?for=gitlab",
      ),
    ).toBe("gitlab");
    expect(parseGreenhouseBoardUrl("https://example.com/gitlab")).toBeNull();
  });

  it("dispatches to the right provider", () => {
    expect(parseBoardUrl("https://job-boards.greenhouse.io/gitlab")).toEqual({
      provider: "greenhouse",
      board: "gitlab",
    });
    expect(
      parseBoardUrl(`https://jobs.lever.co/acme/${LEVER_ID}`),
    ).toMatchObject({
      provider: "lever",
      board: "acme",
    });
    expect(parseBoardUrl("https://jobs.ashbyhq.com/acme")).toEqual({
      provider: "ashby",
      board: "acme",
    });
    expect(parseBoardUrl("https://www.linkedin.com/jobs/view/1")).toBeNull();
    expect(
      importerFor(`https://jobs.ashbyhq.com/acme/${ASHBY_ID}`)?.source,
    ).toBe("ashby");
    expect(
      importerFor("https://job-boards.greenhouse.io/gitlab/jobs/1"),
    ).toBeNull();
  });
});

describe("Lever", () => {
  it("maps a posting: work model, yearly salary, and lists as plain text", () => {
    const posting = leverPostingFromApi(leverJob, {
      site: "leverdemo",
      api: "https://api.lever.co",
    })!;
    expect(posting).toMatchObject({
      externalId: LEVER_ID,
      title: "Customer Success Manager",
      company: null,
      location: "Atlanta, Georgia",
      remote: "hybrid",
      salary: { min: 85000, max: 175000, currency: "USD" },
      url: `https://jobs.lever.co/leverdemo/${LEVER_ID}`,
    });
    expect(posting.description).toContain("Skill Set:");
    expect(posting.description).toContain(
      "- 3+ years of customer relationship or account management experience",
    );
    expect(posting.description).not.toMatch(/<\/?li>/);
  });

  it("ignores a salary that isn't yearly", () => {
    const hourly = {
      ...leverJob,
      salaryRange: { ...leverJob.salaryRange, interval: "per-hour-wage" },
    };
    expect(
      leverPostingFromApi(hourly, { site: "x", api: "https://api.lever.co" })
        ?.salary,
    ).toBeNull();
  });

  it("imports through the API and reports a missing posting as gone", async () => {
    const fetchMock = respond(200, leverJob);
    const target = parseLeverUrl(
      `https://jobs.lever.co/leverdemo/${LEVER_ID}`,
    )!;
    expect(await importLeverJob(target)).toMatchObject({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.lever.co/v0/postings/leverdemo/${LEVER_ID}?mode=json`,
    );
    vi.restoreAllMocks();
    respond(404, { ok: false, error: "Document not found" });
    expect(await importLeverJob(target)).toEqual({
      ok: false,
      error: "postingGone",
    });
  });

  it("lists a board with canonical posting URLs", async () => {
    respond(200, leverBoard);
    const result = await listLeverBoard({
      site: "leverdemo",
      api: "https://api.lever.co",
    });
    expect(
      result.ok && result.postings.map((p) => [p.title, p.remote]),
    ).toEqual([
      ["Customer Success Manager", "hybrid"],
      [leverBoard[1].text, "onsite"],
    ]);
    expect(result.ok && result.postings[0].url).toBe(
      `https://jobs.lever.co/leverdemo/${LEVER_ID}`,
    );
  });
});

describe("Ashby", () => {
  it("imports one posting from the board, with its yearly salary", async () => {
    const fetchMock = respond(200, ashbyBoard);
    const result = await importAshbyJob({ board: "ashby", id: ASHBY_ID });
    expect(result).toMatchObject({
      ok: true,
      posting: {
        externalId: ASHBY_ID,
        title: "Engineering Manager - EU",
        location: "Remote - European Union",
        remote: "remote",
        salary: { min: 110000, max: 185000, currency: "EUR" },
      },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.ashbyhq.com/posting-api/job-board/ashby?includeCompensation=true",
    );
  });

  it("treats unknown and unlisted postings as gone", async () => {
    respond(200, ashbyBoard);
    expect(
      await importAshbyJob({
        board: "ashby",
        id: "00000000-0000-4000-8000-000000000000",
      }),
    ).toEqual({
      ok: false,
      error: "postingGone",
    });
    vi.restoreAllMocks();
    respond(200, {
      ...ashbyBoard,
      jobs: ashbyBoard.jobs.map((j) => ({ ...j, isListed: false })),
    });
    expect(await importAshbyJob({ board: "ashby", id: ASHBY_ID })).toEqual({
      ok: false,
      error: "postingGone",
    });
    vi.restoreAllMocks();
    respond(500, {});
    expect(await importAshbyJob({ board: "ashby", id: ASHBY_ID })).toEqual({
      ok: false,
      error: "boardUnavailable",
    });
  });

  it("lists a board", async () => {
    respond(200, ashbyBoard);
    const result = await listAshbyBoard({ board: "ashby" });
    expect(result.ok && result.postings).toHaveLength(2);
  });
});

describe("Greenhouse board", () => {
  it("lists postings with the company name and canonical URLs", async () => {
    respond(200, greenhouseBoard);
    const result = await listGreenhouseBoard("gitlab");
    expect(result).toMatchObject({ ok: true, company: "GitLab" });
    expect(result.ok && result.postings[0]).toMatchObject({
      externalId: String(greenhouseBoard.jobs[0].id),
      url: `https://job-boards.greenhouse.io/gitlab/jobs/${greenhouseBoard.jobs[0].id}`,
      remote: null,
    });
  });
});

describe("fetchBoardJson", () => {
  it("refuses an oversized body and reports network errors as failed", async () => {
    respond(200, { a: "x".repeat(100) });
    expect(await fetchBoardJson("https://api.lever.co/x", 50)).toEqual({
      ok: false,
      error: "failed",
    });
    vi.restoreAllMocks();
    respond(200, {}, { "content-length": "999999" });
    expect(await fetchBoardJson("https://api.lever.co/x", 1000)).toEqual({
      ok: false,
      error: "failed",
    });
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("redirect"));
    expect(await fetchBoardJson("https://api.lever.co/x", 1000)).toEqual({
      ok: false,
      error: "failed",
    });
  });
});

describe("matchesPreferences", () => {
  const listing = (
    title: string,
    location: string | null,
    remote: "remote" | null = null,
  ) => ({
    title,
    location,
    remote,
  });
  const prefs = {
    targetTitles: ["Backend developer", "Senior engineer"],
    targetLocations: ["Montréal"],
  };

  it("matches a title on a meaningful shared word, ignoring seniority", () => {
    expect(
      matchesPreferences(
        listing("Software Engineer, Backend", "Montreal, QC"),
        prefs,
      ),
    ).toBe(true);
    expect(
      matchesPreferences(
        listing("Senior Account Executive", "Montreal, QC"),
        prefs,
      ),
    ).toBe(false);
  });

  it("matches locations without accents or case, and remote postings anywhere", () => {
    expect(
      matchesPreferences(listing("Backend Developer", "MONTREAL"), prefs),
    ).toBe(true);
    expect(
      matchesPreferences(listing("Backend Developer", "Toronto"), prefs),
    ).toBe(false);
    expect(
      matchesPreferences(
        listing("Backend Developer", "Toronto", "remote"),
        prefs,
      ),
    ).toBe(true);
  });

  it("doesn't filter on empty preferences", () => {
    expect(
      matchesPreferences(listing("Chef", null), {
        targetTitles: [],
        targetLocations: [],
      }),
    ).toBe(true);
  });
});
