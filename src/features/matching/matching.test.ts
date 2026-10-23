// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileData } from "@/db/schema";
import { embedProfile } from "./embed-profile";
import { MAX_PROFILE_TEXT, profileEmbeddingText } from "./profile-text";
import { parseJobListParams, preferencesSchema, splitList } from "./schemas";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user-1" }),
}));

const updatedAt = new Date("2026-10-22T10:00:00.123Z");
const getProfileForEmbedding = vi.fn(
  async (): Promise<{
    data: ProfileData;
    targetTitles: string[];
    updatedAt: Date;
  } | null> => ({
    data: profile,
    targetTitles: ["Backend developer"],
    updatedAt,
  }),
);
const setProfileEmbedding = vi.fn(async () => true);
const savePreferencesRow = vi.fn(async () => true);
vi.mock("@/db/queries/profile", () => ({
  getProfileForEmbedding: () => getProfileForEmbedding(),
  setProfileEmbedding: (...a: unknown[]) => setProfileEmbedding(...(a as [])),
  savePreferences: (...a: unknown[]) => savePreferencesRow(...(a as [])),
}));

const consumeQuota = vi.fn(async (): Promise<"ok" | "exceeded"> => "ok");
vi.mock("@/db/queries/usage", () => ({
  consumeQuota: (...a: unknown[]) => consumeQuota(...(a as [])),
}));

const rateLimited = Object.assign(new Error("rate limited"), {
  name: "VoyageAIError",
});
const embedDocument = vi.fn(async (): Promise<number[]> => [0.1, 0.2]);
vi.mock("@/lib/ai/embeddings", () => ({
  embedDocument: (...a: unknown[]) => embedDocument(...(a as [])),
  isRateLimited: (err: unknown) => err === rateLimited,
}));

const profile: ProfileData = {
  basics: {
    name: "Ada",
    email: "ada@example.com",
    label: "Engineer",
    summary: "Builds APIs.",
  },
  work: [
    {
      id: "w1",
      company: "Acme",
      position: "Senior Engineer",
      startDate: "2019",
      bullets: [{ id: "b1", text: "Built a payments API" }],
    },
  ],
  skills: [{ category: "Languages", items: ["TypeScript", "Go"] }],
};

describe("profileEmbeddingText", () => {
  it("puts target roles first and leaves out contact details", () => {
    const text = profileEmbeddingText(profile, ["Backend developer", "SRE"]);
    expect(text.split("\n")).toEqual([
      "Target roles: Backend developer, SRE",
      "Engineer",
      "Builds APIs.",
      "Languages: TypeScript, Go",
      "Senior Engineer, Acme",
      "Built a payments API",
    ]);
    expect(text).not.toContain("ada@example.com");
    expect(text).not.toContain("Ada");
  });

  it("is capped so an unusually long profile is trimmed, not rejected", () => {
    const long = {
      ...profile,
      work: [
        {
          ...profile.work[0],
          bullets: [{ id: "x", text: "a".repeat(MAX_PROFILE_TEXT) }],
        },
      ],
    };
    expect(profileEmbeddingText(long).length).toBe(MAX_PROFILE_TEXT);
  });
});

describe("schemas", () => {
  it("splits comma-separated lists, dropping blanks and duplicates", () => {
    expect(splitList(" Developer, ,engineer, developer ,Engineer")).toEqual([
      "Developer",
      "engineer",
    ]);
  });

  it("caps preference lists and validates the salary", () => {
    const base = {
      targetTitles: [],
      targetLocations: [],
      remotePreference: "remote",
      minSalary: 90_000,
      salaryCurrency: "CAD",
    };
    expect(preferencesSchema.safeParse(base).success).toBe(true);
    expect(
      preferencesSchema.safeParse({
        ...base,
        targetTitles: Array(11).fill("x"),
      }).success,
    ).toBe(false);
    expect(
      preferencesSchema.safeParse({ ...base, minSalary: -1 }).success,
    ).toBe(false);
    expect(
      preferencesSchema.safeParse({ ...base, minSalary: 1.5 }).success,
    ).toBe(false);
    expect(
      preferencesSchema.safeParse({ ...base, salaryCurrency: "BTC" }).success,
    ).toBe(false);
  });

  it("reads list parameters, falling back to no filter on anything odd", () => {
    expect(parseJobListParams({})).toEqual({ sort: "newest" });
    expect(
      parseJobListParams({
        sort: ["match", "fit"],
        remote: "remote",
        location: "  Montréal ",
        analyzed: "yes",
        salary: "min",
        posting: "closed",
      }),
    ).toEqual({
      sort: "match",
      remote: "remote",
      location: "Montréal",
      analyzed: "yes",
      salary: "min",
      posting: "closed",
    });
    expect(
      parseJobListParams({
        sort: "random",
        remote: "mars",
        location: "x".repeat(101),
        analyzed: "maybe",
        salary: "max",
        posting: "gone",
      }),
    ).toEqual({ sort: "newest" });
  });
});

describe("embedProfile", () => {
  beforeEach(() => {
    embedDocument.mockClear();
    setProfileEmbedding.mockClear();
  });

  it("embeds the profile with its target titles and stores it against its version", async () => {
    expect(await embedProfile("user-1")).toBe("ok");
    expect(embedDocument).toHaveBeenCalledWith(
      expect.stringMatching(/^Target roles: Backend developer\n/),
    );
    expect(setProfileEmbedding).toHaveBeenCalledWith(
      "user-1",
      [0.1, 0.2],
      updatedAt,
    );
  });

  it("reports a profile changed meanwhile, a rate limit, and no profile", async () => {
    setProfileEmbedding.mockResolvedValueOnce(false);
    expect(await embedProfile("user-1")).toBe("superseded");

    vi.spyOn(console, "error").mockImplementation(() => {});
    embedDocument.mockRejectedValueOnce(rateLimited);
    expect(await embedProfile("user-1")).toBe("rateLimited");
    embedDocument.mockRejectedValueOnce(new Error("boom"));
    expect(await embedProfile("user-1")).toBe("failed");

    getProfileForEmbedding.mockResolvedValueOnce(null);
    expect(await embedProfile("user-1")).toBe("noProfile");
  });

  it("reads as rate limited, without calling the service, over the daily cap", async () => {
    consumeQuota.mockResolvedValueOnce("exceeded");
    expect(await embedProfile("user-1")).toBe("rateLimited");
    expect(consumeQuota).toHaveBeenCalledWith("user-1", "embedProfile");
    expect(embedDocument).not.toHaveBeenCalled();
  });
});

describe("savePreferences", () => {
  const prefs = {
    targetTitles: ["Backend developer"],
    targetLocations: [],
    remotePreference: "hybrid",
    minSalary: null,
    salaryCurrency: "CAD",
  };

  it("saves, then reports whether matching is up to date", async () => {
    const { savePreferences } = await import("./actions");
    expect(await savePreferences(prefs)).toEqual({ ok: true, matched: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    embedDocument.mockRejectedValueOnce(new Error("down"));
    expect(await savePreferences(prefs)).toEqual({ ok: true, matched: false });
  });

  it("needs a profile and valid input", async () => {
    const { savePreferences } = await import("./actions");
    savePreferencesRow.mockResolvedValueOnce(false);
    expect(await savePreferences(prefs)).toEqual({
      ok: false,
      error: "noProfile",
    });
    expect(
      await savePreferences({ ...prefs, remotePreference: "mars" }),
    ).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});
