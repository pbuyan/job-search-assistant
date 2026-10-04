// Deterministic en/fr detection by function words, so checking the language
// of an explanation costs no model call. Only words that are not also common
// in the other language are listed ("on", "a", "an", "as", "or" are left out).
const EN = new Set(
  "the and of to in is are was were be been with for that this these those has have had not but your you from at by it its their they which would should could will than then into about there".split(
    " ",
  ),
);
const FR = new Set(
  "le la les des du de et est sont été une un dans pour avec sur pas qui que au aux ce cette ces votre vous nous son sa ses leur leurs mais ou où d l qu n s c j en aussi très être avoir plus".split(
    " ",
  ),
);

export type DetectedLanguage = "en" | "fr" | "unknown";

// Fewer function words than this and the text is too short to call.
const MIN_HITS = 3;
// Share of the hits the winning language needs.
const MIN_SHARE = 0.7;

export function detectLanguage(text: string): DetectedLanguage {
  let en = 0;
  let fr = 0;
  for (const word of text.toLowerCase().split(/[^\p{L}]+/u)) {
    if (EN.has(word)) en++;
    if (FR.has(word)) fr++;
  }
  const total = en + fr;
  if (total < MIN_HITS) return "unknown";
  if (en / total >= MIN_SHARE) return "en";
  if (fr / total >= MIN_SHARE) return "fr";
  return "unknown";
}
