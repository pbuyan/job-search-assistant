// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ashbyBoard from "./fixtures/ashby-board.json";
import notFoundBody from "./fixtures/greenhouse-404.json";
import sample from "./fixtures/greenhouse-job.json";
import leverJob from "./fixtures/lever-job.json";
import type { AshbyBoardCache } from "./boards/ashby";
import { postingFromApi } from "./greenhouse";
import { checkPosting, sameDescription } from "./refresh";

const GH_URL = "https://job-boards.greenhouse.io/gitlab/jobs/8860302002";
const LEVER_URL =
  "https://jobs.lever.co/leverdemo/ad208490-4052-4f91-a57e-433f2d1e484b";
const ashbyUrl = (id: string) => `https://jobs.ashbyhq.com/ashby/${id}`;
const ASHBY_ID = "7458d4e9-da2e-47bd-98cb-adfda43d42b2";
const ASHBY_GONE = "00000000-0000-4000-8000-000000000000";
const ID = "11111111-1111-4111-8111-111111111111";

// Each call gets a fresh Response: a body can only be read once.
const respond = (status: number, body: unknown) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );

afterEach(() => vi.restoreAllMocks());

describe("checkPosting", () => {
  it("reads a Greenhouse posting again from the public API", async () => {
    const fetchMock = respond(200, sample);
    const check = await checkPosting({ source: "greenhouse", url: GH_URL });
    expect(check).toMatchObject({
      state: "open",
      posting: { externalId: "8860302002" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://boards-api.greenhouse.io/v1/boards/gitlab/jobs/8860302002",
    );
  });

  it("marks a 404 as closed, but an unreachable board as unknown", async () => {
    respond(404, notFoundBody);
    expect(await checkPosting({ source: "greenhouse", url: GH_URL })).toEqual({
      state: "closed",
    });
    expect(await checkPosting({ source: "lever", url: LEVER_URL })).toEqual({
      state: "closed",
    });
    vi.restoreAllMocks();
    respond(503, {});
    expect(await checkPosting({ source: "greenhouse", url: GH_URL })).toEqual({
      state: "unavailable",
    });
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    expect(await checkPosting({ source: "lever", url: LEVER_URL })).toEqual({
      state: "unavailable",
    });
  });

  it("reads Lever postings, and Ashby postings from one shared board read", async () => {
    respond(200, leverJob);
    expect(
      await checkPosting({ source: "lever", url: LEVER_URL }),
    ).toMatchObject({ state: "open" });
    vi.restoreAllMocks();

    const fetchMock = respond(200, ashbyBoard);
    const boards: AshbyBoardCache = new Map();
    const open = await checkPosting(
      { source: "ashby", url: ashbyUrl(ASHBY_ID) },
      boards,
    );
    // Not on the board (or unlisted) means gone.
    const gone = await checkPosting(
      { source: "ashby", url: ashbyUrl(ASHBY_GONE) },
      boards,
    );
    expect(open).toMatchObject({
      state: "open",
      posting: { externalId: ASHBY_ID },
    });
    expect(gone).toEqual({ state: "closed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("can't check pasted jobs, other sites, or a URL that isn't the board's", async () => {
    const fetchMock = respond(200, sample);
    for (const job of [
      { source: "manual", url: null },
      { source: "url", url: "https://example.com/careers/1" },
      { source: "greenhouse", url: null },
      { source: "lever", url: "https://example.com/not-lever" },
    ])
      expect(await checkPosting(job)).toEqual({ state: "unsupported" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores whitespace-only edits", () => {
    expect(
      sameDescription("Build  things.\n\nWell.", " Build things. Well."),
    ).toBe(true);
    expect(sameDescription("Build things.", "Build other things.")).toBe(false);
  });
});

// ---- the Server Action ----
let userId: string | null = "user-1";
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId }) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));

const stored = {
  id: ID,
  source: "greenhouse" as string,
  url: GH_URL as string | null,
  descriptionRaw: "",
  closedAt: null as Date | null,
};
const getJobPosting = vi.fn(async () => stored);
const markPostingChecked = vi.fn(async () => true);
const updateJobPosting = vi.fn(async () => true);
vi.mock("@/db/queries/jobs", () => ({
  getJobPosting: () => getJobPosting(),
  markPostingChecked: (...a: unknown[]) => markPostingChecked(...(a as [])),
  updateJobPosting: (...a: unknown[]) => updateJobPosting(...(a as [])),
  getJob: vi.fn(),
  upsertJob: vi.fn(),
  deleteJob: vi.fn(),
}));
vi.mock("@/db/queries/matches", () => ({ insertMatch: vi.fn() }));
vi.mock("@/db/queries/profile", () => ({ getProfile: vi.fn() }));
const consumeQuota = vi.fn(async (): Promise<"ok" | "exceeded"> => "ok");
vi.mock("@/db/queries/usage", () => ({
  consumeQuota: (...a: unknown[]) => consumeQuota(...(a as [])),
}));
const parseAndEmbed = vi.fn(async () => ({
  ok: true as const,
  output: {
    job: { title: "Engineer", company: "GitLab", remote: "remote" as const },
    requirements: {
      mustHave: ["Go"],
      niceToHave: [],
      techStack: [],
      responsibilities: [],
    },
    language: "en",
  },
  model: "test-model",
  promptVersion: "parse-job@test",
  embedding: [0.1],
}));
vi.mock("./ingest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ingest")>()),
  parseAndEmbed: (...a: unknown[]) => parseAndEmbed(...(a as [])),
}));

describe("checkJobPosting", () => {
  const description = postingFromApi(sample, GH_URL)!.description;

  beforeEach(() => {
    userId = "user-1";
    Object.assign(stored, {
      source: "greenhouse",
      url: GH_URL,
      descriptionRaw: description,
      closedAt: null,
    });
    for (const m of [
      markPostingChecked,
      updateJobPosting,
      consumeQuota,
      parseAndEmbed,
    ])
      m.mockClear();
  });

  it("records an unchanged open posting without any AI call", async () => {
    respond(200, sample);
    const { checkJobPosting } = await import("./actions");
    expect(await checkJobPosting(ID)).toEqual({ ok: true, outcome: "open" });
    expect(markPostingChecked).toHaveBeenCalledWith("user-1", ID, "open");
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(parseAndEmbed).not.toHaveBeenCalled();
  });

  it("re-parses a changed posting under the parseJob quota", async () => {
    respond(200, sample);
    stored.descriptionRaw = "The old text of this posting.";
    const { checkJobPosting } = await import("./actions");
    expect(await checkJobPosting(ID)).toEqual({ ok: true, outcome: "updated" });
    expect(consumeQuota).toHaveBeenCalledWith("user-1", "parseJob");
    expect(updateJobPosting).toHaveBeenCalledWith(
      "user-1",
      ID,
      expect.objectContaining({
        descriptionRaw: description,
        requirementsModel: "test-model",
        requirementsPromptVersion: "parse-job@test",
        embedding: [0.1],
      }),
    );

    // Over the cap: still recorded as open, but not re-parsed.
    consumeQuota.mockResolvedValueOnce("exceeded");
    parseAndEmbed.mockClear();
    expect(await checkJobPosting(ID)).toEqual({
      ok: false,
      error: "quotaExceeded",
    });
    expect(markPostingChecked).toHaveBeenLastCalledWith("user-1", ID, "open");
    expect(parseAndEmbed).not.toHaveBeenCalled();
  });

  it("marks a gone posting closed, and leaves the job alone when the board is down", async () => {
    const { checkJobPosting } = await import("./actions");
    respond(404, notFoundBody);
    expect(await checkJobPosting(ID)).toEqual({ ok: true, outcome: "closed" });
    expect(markPostingChecked).toHaveBeenCalledWith("user-1", ID, "closed");

    vi.restoreAllMocks();
    markPostingChecked.mockClear();
    respond(500, {});
    expect(await checkJobPosting(ID)).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(markPostingChecked).not.toHaveBeenCalled();
  });

  it("needs a signed-in user, a valid id and a board posting", async () => {
    const fetchMock = respond(200, sample);
    const { checkJobPosting } = await import("./actions");
    expect(await checkJobPosting("nope")).toEqual({
      ok: false,
      error: "notFound",
    });
    stored.source = "manual";
    expect(await checkJobPosting(ID)).toEqual({
      ok: false,
      error: "unsupported",
    });
    userId = null;
    expect(await checkJobPosting(ID)).toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
