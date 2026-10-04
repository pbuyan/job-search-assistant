import { describe, expect, it } from "vitest";
import { localeSchema } from "@/features/profile/schemas";
import { localeFromPathname, signInPath } from "./auth-routing";

describe("localeFromPathname", () => {
  it("reads a supported locale prefix", () => {
    expect(localeFromPathname("/fr/jobs")).toBe("fr");
  });
  it("falls back to the default locale", () => {
    expect(localeFromPathname("/de/jobs")).toBe("en");
    expect(localeFromPathname("/")).toBe("en");
  });
});

describe("signInPath", () => {
  it("keeps the locale and encodes the return URL", () => {
    expect(signInPath("/fr/jobs", "?q=a b")).toBe(
      "/fr/sign-in?redirect_url=%2Ffr%2Fjobs%3Fq%3Da%20b",
    );
  });
});

describe("localeSchema", () => {
  it("accepts only configured locales", () => {
    expect(localeSchema.safeParse("fr").success).toBe(true);
    expect(localeSchema.safeParse("es").success).toBe(false);
  });
});
