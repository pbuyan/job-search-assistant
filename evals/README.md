# Prompt evals

`pnpm eval` runs the real job extraction (`parse-job`), fit analysis
(`fit-analysis`), resume tailoring (`tailor-resume`) and resume translation
(`translate-resume`) on every case in `cases.ts`, using live Claude calls (real cost; needs `.env.local`). Run it before and after any prompt change and
report both tables.

- `pnpm eval --suite fit|tailor|translate` runs one suite (default: all).
- `pnpm eval --case <id>` runs a single case.
- `pnpm eval --concurrency <n>` runs n cases at a time (default 3).

## Checks per fit case

| column     | passes when                                                                 |
| ---------- | --------------------------------------------------------------------------- |
| `parsed`   | the posting language detected by `parse-job` is the expected one            |
| `in range` | the computed fit score is inside the case's hand-set range                  |
| `evidence` | every `evidenceBulletId` exists in the profile (re-checked independently)   |
| `1st try`  | the first answer was valid; `analyzeFit` retries once, hiding slips         |
| `lang`     | summary and per-requirement texts are in the requested output language     |

## Checks per tailoring case (`TAILOR_CASES`)

| column    | passes when                                                              |
| --------- | ------------------------------------------------------------------------ |
| `sources` | every bullet cites a bullet id that exists in the profile                |
| `numbers` | no bullet contains a number its source bullet doesn't                    |
| `1st try` | the first answer was valid; `tailorResume` retries once, hiding slips    |
| `lang`    | the bullets stay in the profile's language, whatever the posting's       |

## Checks per translation case (`TRANSLATE_CASES`)

Each fixture profile, as a resume version with every entry, is translated
into the other language.

| column      | passes when                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| `structure` | entries, employers and bullet ids line up with the source, in order         |
| `numbers`   | every bullet keeps exactly the numbers of its source (formatting may vary)  |
| `style`     | no French bullet opens on a bare past participle ("Dirigé…", an anglicism)  |
| `1st try`   | the first answer was valid; `translateResume` retries once, hiding slips    |
| `lang`      | the bullets are in the target language                                      |

`?` in `lang` means the text was too short to detect; it doesn't fail the
case. The process exits 1 if any case fails. Full results, including the
model's output, are written to `evals/results/` (gitignored).

## Fixtures

- `fixtures/postings/`: real postings from public Greenhouse/Ashby boards,
  with their source URL and fetch date. Only add postings from sources the
  project allows (pasted text, Greenhouse/Lever/Ashby public APIs, licensed
  aggregators).
- `fixtures/profiles/`: synthetic candidates. Never put a real resume here.

## Adding a case

Add an entry to `CASES` in `cases.ts`. Set the score range by reading the
posting against the profile before running the eval, and write down why in
a comment. Don't widen a range just because the model missed it — that's the
regression the eval is there to catch.
