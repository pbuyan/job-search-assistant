// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DAILY_LIMITS, dailyLimit, usageDay } from "./quotas";

describe("dailyLimit", () => {
  it("uses the base cap when no multiplier is set or it is invalid", () => {
    expect(dailyLimit("tailorResume", undefined)).toBe(DAILY_LIMITS.tailorResume);
    expect(dailyLimit("tailorResume", "")).toBe(DAILY_LIMITS.tailorResume);
    expect(dailyLimit("tailorResume", "abc")).toBe(DAILY_LIMITS.tailorResume);
    expect(dailyLimit("tailorResume", "-2")).toBe(DAILY_LIMITS.tailorResume);
    expect(dailyLimit("tailorResume", "0")).toBe(DAILY_LIMITS.tailorResume);
  });

  it("scales the cap and never drops below one call", () => {
    expect(dailyLimit("parseJob", "10")).toBe(DAILY_LIMITS.parseJob * 10);
    expect(dailyLimit("parseResume", "0.01")).toBe(1);
  });
});

describe("usageDay", () => {
  it("is the UTC date, whatever the local time zone", () => {
    expect(usageDay(new Date("2026-10-22T23:59:59-04:00"))).toBe("2026-10-23");
    expect(usageDay(new Date("2026-10-22T00:00:00Z"))).toBe("2026-10-22");
  });
});
