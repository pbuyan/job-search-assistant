// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMS } from "@/db/schema";
import { EMBED_MAX_RETRIES, embedDocument, isRateLimited } from "./embeddings";

const rateLimited = () =>
  new Response(JSON.stringify({ detail: "reduced rate limits of 3 RPM" }), {
    status: 429,
    headers: { "content-type": "application/json" },
  });
const embedded = () =>
  new Response(
    JSON.stringify({
      object: "list",
      data: [
        {
          object: "embedding",
          index: 0,
          embedding: Array(EMBEDDING_DIMS).fill(0.1),
        },
      ],
      model: "voyage-4",
      usage: { total_tokens: 3 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

// Runs embedDocument while letting the SDK's backoff timers fire instantly.
async function run() {
  const settled = embedDocument("posting").then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  return settled;
}

describe("embedDocument rate limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("VOYAGE_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("waits out a 429 and succeeds on retry", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(embedded());
    const result = await run();
    expect(result).toEqual({ value: Array(EMBEDDING_DIMS).fill(0.1) });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports a rate limit that outlasts every retry", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => rateLimited());
    const result = await run();
    expect("error" in result && isRateLimited(result.error)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(EMBED_MAX_RETRIES + 1);
  });

  it("does not treat other failures as rate limiting", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("{}", { status: 401 }),
    );
    const result = await run();
    expect("error" in result && isRateLimited(result.error)).toBe(false);
  });
});
