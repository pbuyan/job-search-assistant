// Search preferences and job-list parameters. Kept free of server imports so
// the forms and filters can use them too.
import { z } from "zod";

export const REMOTE_TYPES = ["onsite", "hybrid", "remote", "unknown"] as const;
export const CURRENCIES = ["CAD", "USD", "EUR", "GBP"] as const;

// "Developer, Engineer" → ["Developer", "Engineer"]: trimmed, de-duplicated
// (case-insensitively), empty parts dropped.
export function splitList(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => {
      const k = v.toLowerCase();
      if (!v || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

const list = z.array(z.string().trim().min(1).max(100)).max(10);

export const preferencesSchema = z.object({
  targetTitles: list,
  targetLocations: list,
  remotePreference: z.enum(REMOTE_TYPES),
  minSalary: z.number().int().min(0).max(10_000_000).nullable(),
  salaryCurrency: z.enum(CURRENCIES),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const JOB_SORTS = ["newest", "match", "fit"] as const;
export type JobSort = (typeof JOB_SORTS)[number];

// The jobs list's URL parameters. Anything unknown or malformed falls back
// to "no filter" instead of an error page.
export const jobListParamsSchema = z.object({
  sort: z.enum(JOB_SORTS).catch("newest"),
  remote: z.enum(REMOTE_TYPES).optional().catch(undefined),
  location: z
    .string()
    .trim()
    .max(100)
    .optional()
    .catch(undefined)
    .transform((v) => v || undefined),
  analyzed: z.enum(["yes", "no"]).optional().catch(undefined),
  salary: z.literal("min").optional().catch(undefined),
});
export type JobListParams = z.infer<typeof jobListParamsSchema>;

// Repeated parameters (?sort=a&sort=b) take the first value.
export function parseJobListParams(
  raw: Record<string, string | string[] | undefined>,
): JobListParams {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  return jobListParamsSchema.parse({
    sort: first(raw.sort),
    remote: first(raw.remote),
    location: first(raw.location),
    analyzed: first(raw.analyzed),
    salary: first(raw.salary),
  });
}
