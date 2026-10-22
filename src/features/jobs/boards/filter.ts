import type { BoardListing } from "./common";

// Seniority and filler words say nothing about the kind of job, so they
// don't count as a title match on their own.
const GENERIC = new Set([
  "senior",
  "junior",
  "lead",
  "staff",
  "principal",
  "head",
  "intern",
  "sr",
  "jr",
  "the",
  "and",
  "for",
  "with",
  "of",
  "de",
  "du",
  "des",
  "et",
  "la",
  "le",
  "les",
]);

// Lower-case, accent-free words, so "Développeur" matches "developpeur".
const words = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#]+/u)
    .filter(Boolean);

const fold = (text: string) => words(text).join(" ");

export type ListingPreferences = {
  targetTitles: string[];
  targetLocations: string[];
};

// Whether a board posting fits the user's search preferences. A title fits
// when it shares a meaningful word with any target title ("Backend
// developer" fits "Senior Software Engineer, Backend"); a location fits when
// it contains a target location, and remote postings always fit on location.
// An empty preference list doesn't filter.
export function matchesPreferences(
  listing: Pick<BoardListing, "title" | "location" | "remote">,
  prefs: ListingPreferences,
): boolean {
  if (prefs.targetTitles.length > 0) {
    const wanted = new Set(
      prefs.targetTitles
        .flatMap(words)
        .filter((w) => w.length >= 2 && !GENERIC.has(w)),
    );
    const title = words(listing.title);
    if (wanted.size > 0 && !title.some((w) => wanted.has(w))) return false;
  }
  if (prefs.targetLocations.length > 0 && listing.remote !== "remote") {
    const location = fold(listing.location ?? "");
    if (
      !prefs.targetLocations.some((l) => fold(l) && location.includes(fold(l)))
    )
      return false;
  }
  return true;
}
