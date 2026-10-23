// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostingCheck } from "@/features/jobs/refresh";

const listJobsToCheck = vi.fn(async () => [
  { id: "job-a", userId: "user-1", source: "greenhouse", url: "a" },
  { id: "job-b", userId: "user-2", source: "lever", url: "b" },
  { id: "job-c", userId: "user-1", source: "ashby", url: "c" },
]);
const markPostingChecked = vi.fn(async () => true);
vi.mock("@/db/queries/jobs", () => ({
  listJobsToCheck: (...a: unknown[]) => listJobsToCheck(...(a as [])),
  markPostingChecked: (...a: unknown[]) => markPostingChecked(...(a as [])),
}));

const results: Record<string, PostingCheck> = {
  a: { state: "closed" },
  b: { state: "unavailable" },
  c: { state: "unsupported" },
};
const checkPosting = vi.fn(async (job: { url: string }) => results[job.url]);
vi.mock("@/features/jobs/refresh", () => ({
  checkPosting: (job: { url: string }) => checkPosting(job),
}));

const call = (authorization?: string) =>
  new Request("http://localhost/api/cron/refresh-jobs", {
    headers: authorization ? { authorization } : {},
  });

describe("GET /api/cron/refresh-jobs", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.spyOn(console, "info").mockImplementation(() => {});
    markPostingChecked.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses calls without the cron secret, and when none is configured", async () => {
    const { GET } = await import("./route");
    expect((await GET(call())).status).toBe(401);
    expect((await GET(call("Bearer wrong"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(call("Bearer "))).status).toBe(401);
    expect(listJobsToCheck).not.toHaveBeenCalled();
  });

  it("records each check for the job's own user, with no AI involved", async () => {
    const { GET } = await import("./route");
    const res = await GET(call("Bearer s3cret"));
    expect(await res.json()).toEqual({
      checked: 3,
      open: 0,
      closed: 1,
      unavailable: 1,
      unsupported: 1,
    });
    const calls = markPostingChecked.mock.calls as unknown[][];
    expect(calls.map((c) => c.slice(0, 3))).toEqual(
      expect.arrayContaining([
        ["user-1", "job-a", "closed"],
        ["user-2", "job-b", "unavailable"],
        ["user-1", "job-c", "unavailable"],
      ]),
    );
  });
});
