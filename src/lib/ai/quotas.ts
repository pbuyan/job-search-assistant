import type { aiFeature } from "@/db/schema";

export type AiFeature = (typeof aiFeature.enumValues)[number];

// Calls per user per UTC day. Each is a paid Claude or Voyage call; the caps
// are generous for one person's job search and stop runaway use.
export const DAILY_LIMITS: Record<AiFeature, number> = {
  parseResume: 10,
  parseJob: 50,
  fitAnalysis: 50,
  tailorResume: 20,
  translateResume: 20,
  embedProfile: 100,
};

// AI_DAILY_LIMIT_MULTIPLIER scales every cap (e.g. 10 in dev or e2e, 0.1 to
// try the limit by hand). Unset or invalid means 1. A cap never drops below 1.
export function dailyLimit(
  feature: AiFeature,
  multiplier = process.env.AI_DAILY_LIMIT_MULTIPLIER,
): number {
  const factor = Number(multiplier);
  const scale = multiplier && Number.isFinite(factor) && factor > 0 ? factor : 1;
  return Math.max(1, Math.floor(DAILY_LIMITS[feature] * scale));
}

// The usage row's day: the current date in UTC, as YYYY-MM-DD.
export function usageDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
