import type { ProfileData } from "@/db/schema";

// Upper bound on what is embedded, well under the embedding model's context
// so an unusually long profile is trimmed rather than rejected. Bullets come
// last, so trimming drops the oldest achievements first.
export const MAX_PROFILE_TEXT = 40_000;

// The text that represents a profile for job matching: what the candidate
// wants (target roles), who they are (headline, summary, skills), then what
// they did (positions and achievements, most recent first as entered).
export function profileEmbeddingText(
  profile: ProfileData,
  targetTitles: string[] = [],
): string {
  const lines = [
    targetTitles.length > 0 ? `Target roles: ${targetTitles.join(", ")}` : "",
    profile.basics.label ?? "",
    profile.basics.summary ?? "",
    ...profile.skills.map((s) => `${s.category}: ${s.items.join(", ")}`),
    ...profile.work.flatMap((w) => [
      `${w.position}, ${w.company}`,
      ...w.bullets.map((b) => b.text),
    ]),
    ...(profile.projects ?? []).flatMap((p) => [
      p.name,
      ...p.bullets.map((b) => b.text),
    ]),
  ];
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_PROFILE_TEXT);
}
