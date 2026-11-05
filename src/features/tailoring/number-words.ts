// Cardinal numbers written as words in English and French, so that an invented
// "four developers" or "quatre développeurs" is caught like "4 developers".
// Values are returned as digit strings, comparable with numbersIn's output.
//
// Deliberately left out:
// - Words that are usually not numbers: "one", "un", "une" (articles), "neuf"
//   ("new"), "cent" ("per cent") and the bare multipliers ("hundred",
//   "thousand", "million", "mille"). They count only inside a longer number,
//   as in "twenty-one", "vingt et un", "dix-neuf", "deux cents", "two
//   thousand".
// - Ordinals ("first", "deuxième") and vague amounts ("dozen", "couple",
//   "douzaine", "hundreds of").

const UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8,
  neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14,
  quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40,
  cinquante: 50, soixante: 60, septante: 70, huitante: 80, nonante: 90,
};
// "six" is the same word in both languages.

const HUNDRED = new Set(["hundred", "cent", "cents"]);
const BIG: Record<string, number> = {
  thousand: 1_000, mille: 1_000,
  million: 1_000_000, millions: 1_000_000,
};
// Count only alongside another number word.
const AMBIGUOUS = new Set([
  "one", "un", "une", "neuf", "hundred", "cent", "cents",
  ...Object.keys(BIG),
]);

const isNumberWord = (w: string) => w in UNITS || HUNDRED.has(w) || w in BIG;

// Words of one number may be separated by spaces or hyphens only.
const JOINER = /^[\s\-‐‑]+$/;

export function numberWordsIn(text: string): Set<string> {
  const found = new Set<string>();
  const tokens = text.toLowerCase().match(/\p{L}+|[^\p{L}]+/gu) ?? [];

  let words: string[] = [];
  const flush = () => {
    if (words.some((w) => !AMBIGUOUS.has(w))) found.add(String(valueOf(words)));
    words = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (isNumberWord(t)) {
      words.push(t);
      continue;
    }
    if (words.length && JOINER.test(t)) continue;
    // "two hundred and five", "vingt et un", "soixante et onze".
    const next = tokens[i + 2];
    const last = words.at(-1);
    if (
      last &&
      ((t === "and" && (HUNDRED.has(last) || last in BIG) && next && next in UNITS) ||
        (t === "et" && next && ["un", "une", "onze"].includes(next)))
    )
      continue;
    flush();
  }
  flush();
  return found;
}

function valueOf(words: string[]): number {
  let total = 0;
  let current = 0;
  words.forEach((w, i) => {
    if (w in UNITS) {
      // "quatre-vingt(s)" is 4 × 20.
      if ((w === "vingt" || w === "vingts") && words[i - 1] === "quatre")
        current += 76;
      else current += UNITS[w];
    } else if (HUNDRED.has(w)) {
      current = (current || 1) * 100;
    } else {
      total += (current || 1) * BIG[w];
      current = 0;
    }
  });
  return total + current;
}
