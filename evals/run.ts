// pnpm eval [--suite fit|tailor|translate|cover|all] [--case <id>] [--concurrency <n>]
//
// fit: runs the real extraction (parseJob) and fit analysis (analyzeFit) on
// every case in CASES and checks the posting language, the score range, that
// every evidenceBulletId exists in the profile, that the answer was valid on
// the first attempt, and the language of the explanation.
// tailor: runs tailorResume on every case in TAILOR_CASES and checks that
// every bullet cites a profile bullet, that no number was added, that the
// answer was valid on the first attempt, and that the resume stayed in the
// profile's language.
// translate: translates each fixture profile (as a resume version) with
// translateResume into the other language and checks that entries and
// bullets line up with the source, that every bullet keeps its numbers, that
// French bullets don't open on a bare past participle, that the answer was
// valid on the first attempt, and the output language.
// cover: drafts a cover letter with draftCoverLetter for every case in
// COVER_CASES and checks that every citation is a profile bullet, that no
// paragraph adds a number its cited bullets don't state, that the answer was
// valid on the first attempt, and that the letter is in the resume's language.
// Prints a table per suite and exits 1 if any check fails. Full results
// (including model output) go to evals/results/, which is gitignored.
//
// Live Claude calls: every full run costs real tokens.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { z } from "zod";
import type { ParseJobResult } from "@/features/jobs/parse-job";
import { profileDataSchema } from "@/prompts/schemas";
import {
  CASES,
  COVER_CASES,
  TAILOR_CASES,
  TRANSLATE_CASES,
  type CoverCase,
  type EvalCase,
  type PostingId,
  type ProfileId,
  type TailorCase,
  type TranslateCase,
} from "./cases";
import {
  checkCover,
  checkFit,
  checkParse,
  checkTailor,
  checkTranslate,
  type Check,
} from "./lib/checks";

// Must run before src/lib/ai/models.ts is loaded: it reads the env at import.
config({ path: ".env.local", quiet: true });

const ROOT = join(process.cwd(), "evals");
const postingSchema = z.object({
  id: z.string(),
  source: z.object({ url: z.url(), fetchedAt: z.string() }),
  text: z.string().min(1),
});

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const loadPosting = (id: PostingId) =>
  postingSchema.parse(readJson(`fixtures/postings/${id}.json`));
const loadProfile = (id: ProfileId) =>
  profileDataSchema.parse(readJson(`fixtures/profiles/${id}.json`));

type CaseResult = {
  case: EvalCase;
  checks: Check[];
  error?: string;
  problems?: unknown;
  parsedLanguage?: string;
  score?: number;
  analysis?: unknown;
};

type TailorResult = {
  case: TailorCase;
  checks: Check[];
  error?: string;
  problems?: unknown;
  attempts?: number;
  plan?: unknown;
};

type TranslateResult = {
  case: TranslateCase;
  checks: Check[];
  error?: string;
  problems?: unknown;
  resume?: unknown;
};

type CoverResult = {
  case: CoverCase;
  checks: Check[];
  error?: string;
  problems?: unknown;
  draft?: unknown;
};

const passed = (r: { error?: string; checks: Check[] }) =>
  !r.error && r.checks.every((c) => c.pass);

async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function main() {
  const { values } = parseArgs({
    options: {
      suite: { type: "string", default: "all" },
      case: { type: "string" },
      concurrency: { type: "string", default: "3" },
    },
  });
  if (!["fit", "tailor", "translate", "cover", "all"].includes(values.suite)) {
    console.error(`Unknown suite: ${values.suite}`);
    process.exit(2);
  }
  const pick = <T extends { id: string }>(all: T[], suite: string) =>
    values.suite !== "all" && values.suite !== suite
      ? []
      : values.case
        ? all.filter((c) => c.id === values.case)
        : all;
  const cases = pick(CASES, "fit");
  const tailorCases = pick(TAILOR_CASES, "tailor");
  const translateCases = pick(TRANSLATE_CASES, "translate");
  const coverCases = pick(COVER_CASES, "cover");
  if (
    cases.length +
      tailorCases.length +
      translateCases.length +
      coverCases.length ===
    0
  ) {
    console.error(`Unknown case: ${values.case}`);
    process.exit(2);
  }
  const concurrency = Math.max(1, Number(values.concurrency) || 3);

  const { parseJob } = await import("@/features/jobs/parse-job");
  const { analyzeFit } = await import("@/features/jobs/analyze-fit");
  const { profileBullets, PROMPT_VERSION: fitVersion } =
    await import("@/prompts/fit-analysis");
  const { PROMPT_VERSION: parseVersion } = await import("@/prompts/parse-job");
  const { tailorResume } = await import("@/features/tailoring/tailor");
  const { PROMPT_VERSION: tailorVersion } =
    await import("@/prompts/tailor-resume");
  const { translateResume } = await import("@/features/translation/translate");
  const { PROMPT_VERSION: translateVersion } =
    await import("@/prompts/translate-resume");
  const { draftCoverLetter } = await import("@/features/cover-letter/draft");
  const { PROMPT_VERSION: coverVersion } =
    await import("@/prompts/cover-letter");
  const { assembleResume } = await import("@/features/tailoring/assemble");
  const { MODEL_IDS } = await import("@/lib/ai/models");

  // Each posting is parsed once per run, however many cases use it.
  const parses = new Map<PostingId, Promise<ParseJobResult>>();
  const parse = (id: PostingId) => {
    if (!parses.has(id)) parses.set(id, parseJob(loadPosting(id).text));
    return parses.get(id)!;
  };

  const started = Date.now();
  const results = await pool(
    cases,
    concurrency,
    async (c): Promise<CaseResult> => {
      const parsed = await parse(c.posting);
      if (!parsed.ok)
        return { case: c, checks: [], error: `parse:${parsed.error}` };
      const { requirements, language } = parsed.output;
      const checks = checkParse({
        detected: language,
        expected: c.expect.language,
        requirementCount:
          requirements.mustHave.length + requirements.niceToHave.length,
      });

      const profile = loadProfile(c.profile);
      const fit = await analyzeFit({
        requirements,
        profile,
        outputLanguage: c.outputLanguage,
      });
      if (!fit.ok)
        return {
          case: c,
          checks,
          error: `fit:${fit.error}`,
          problems: fit.problems,
          parsedLanguage: language,
        };

      checks.push(
        ...checkFit({
          analysis: fit.analysis,
          score: fit.score,
          attempts: fit.attempts,
          range: c.expect.score,
          bulletIds: new Set(profileBullets(profile).map((b) => b.id)),
          outputLanguage: c.outputLanguage,
        }),
      );
      return {
        case: c,
        checks,
        parsedLanguage: language,
        score: fit.score,
        analysis: fit.analysis,
      };
    },
  );

  const tailorResults = await pool(
    tailorCases,
    concurrency,
    async (c): Promise<TailorResult> => {
      const parsed = await parse(c.posting);
      if (!parsed.ok)
        return { case: c, checks: [], error: `parse:${parsed.error}` };
      const profile = loadProfile(c.profile);
      // The resume language is the profile's, never the posting's.
      const tailored = await tailorResume({
        job: parsed.output.job,
        requirements: parsed.output.requirements,
        profile,
        resumeLanguage: c.expect.language,
      });
      if (!tailored.ok)
        return {
          case: c,
          checks: [],
          error: `tailor:${tailored.error}`,
          problems: tailored.problems,
        };
      return {
        case: c,
        checks: checkTailor({
          bullets: [...tailored.plan.work, ...tailored.plan.projects].flatMap(
            (e) => e.bullets,
          ),
          attempts: tailored.attempts,
          masterBullets: new Map(
            profileBullets(profile).map((b) => [b.id, b.text]),
          ),
          language: c.expect.language,
        }),
        attempts: tailored.attempts,
        plan: tailored.plan,
      };
    },
  );

  const translateResults = await pool(
    translateCases,
    concurrency,
    async (c): Promise<TranslateResult> => {
      const profile = loadProfile(c.profile);
      // The whole profile as a resume version: every entry and bullet.
      const source = assembleResume(
        {
          summary: profile.basics.summary,
          work: profile.work.map((w) => ({
            sourceWorkId: w.id,
            bullets: w.bullets.map((b) => ({
              sourceBulletId: b.id,
              text: b.text,
            })),
          })),
          projects: (profile.projects ?? []).map((p) => ({
            sourceProjectId: p.id,
            bullets: p.bullets.map((b) => ({
              sourceBulletId: b.id,
              text: b.text,
            })),
          })),
          skills: profile.skills,
        },
        profile,
      );
      const translated = await translateResume({
        resume: source,
        sourceLanguage: c.from,
        targetLanguage: c.to,
      });
      if (!translated.ok)
        return {
          case: c,
          checks: [],
          error: `translate:${translated.error}`,
          problems: translated.problems,
        };
      return {
        case: c,
        checks: checkTranslate({
          source,
          out: translated.resume,
          attempts: translated.attempts,
          language: c.to,
        }),
        resume: translated.resume,
      };
    },
  );

  const coverResults = await pool(
    coverCases,
    concurrency,
    async (c): Promise<CoverResult> => {
      const parsed = await parse(c.posting);
      if (!parsed.ok)
        return { case: c, checks: [], error: `parse:${parsed.error}` };
      const profile = loadProfile(c.profile);
      const drafted = await draftCoverLetter({
        job: parsed.output.job,
        requirements: parsed.output.requirements,
        profile,
        letterLanguage: c.expect.language,
      });
      if (!drafted.ok)
        return {
          case: c,
          checks: [],
          error: `cover:${drafted.error}`,
          problems: drafted.problems,
        };
      return {
        case: c,
        checks: checkCover({
          paragraphs: drafted.draft.paragraphs,
          attempts: drafted.attempts,
          masterBullets: new Map(
            profileBullets(profile).map((b) => [b.id, b.text]),
          ),
          job: parsed.output.job,
          language: c.expect.language,
        }),
        draft: drafted.draft,
      };
    },
  );

  if (results.length > 0) printTable(results);
  if (tailorResults.length > 0) printTailorTable(tailorResults);
  if (translateResults.length > 0) printTranslateTable(translateResults);
  if (coverResults.length > 0) printCoverTable(coverResults);
  const failures = [
    ...results,
    ...tailorResults,
    ...translateResults,
    ...coverResults,
  ].filter((r) => !passed(r));
  const total =
    results.length +
    tailorResults.length +
    translateResults.length +
    coverResults.length;
  console.log(
    `\n${total - failures.length}/${total} passed in ${Math.round((Date.now() - started) / 1000)} s · ${parseVersion} · ${fitVersion} · ${tailorVersion} · ${translateVersion} · ${coverVersion} · ${MODEL_IDS.parseJob} / ${MODEL_IDS.fitAnalysis} / ${MODEL_IDS.tailorResume} / ${MODEL_IDS.translateResume} / ${MODEL_IDS.coverLetter}`,
  );
  for (const r of failures) {
    const reasons = [
      r.error,
      ...r.checks
        .filter((c) => !c.pass)
        .map((c) => `${c.name}: ${c.detail ?? "failed"}`),
    ].filter(Boolean);
    console.log(`  ✗ ${r.case.id} — ${reasons.join("; ")}`);
    if (r.problems) console.log(`    problems: ${JSON.stringify(r.problems)}`);
  }

  const dir = join(ROOT, "results");
  mkdirSync(dir, { recursive: true });
  const file = join(
    dir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    file,
    JSON.stringify(
      {
        promptVersions: {
          parseJob: parseVersion,
          fitAnalysis: fitVersion,
          tailorResume: tailorVersion,
          translateResume: translateVersion,
          coverLetter: coverVersion,
        },
        models: MODEL_IDS,
        passed: total - failures.length,
        total,
        results: results.map((r) => ({
          ...r,
          case: r.case.id,
          pass: passed(r),
        })),
        tailorResults: tailorResults.map((r) => ({
          ...r,
          case: r.case.id,
          pass: passed(r),
        })),
        translateResults: translateResults.map((r) => ({
          ...r,
          case: r.case.id,
          pass: passed(r),
        })),
        coverResults: coverResults.map((r) => ({
          ...r,
          case: r.case.id,
          pass: passed(r),
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nResults: ${file}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

const mark = (r: { checks: Check[] }, name: Check["name"]) => {
  const c = r.checks.find((x) => x.name === name);
  if (!c) return "–";
  return c.pass ? (c.warn ? "?" : "✓") : "✗";
};

function printRows(header: string[], rows: string[][]) {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i])).join("  ");
  console.log(line(header));
  console.log(widths.map((w) => "─".repeat(w)).join("  "));
  for (const row of rows) console.log(line(row));
  console.log(
    "\n✓ pass  ✗ fail  ? undecided (text too short to detect)  – not run",
  );
}

function printTailorTable(results: TailorResult[]) {
  console.log("");
  printRows(
    ["case", "job→prof", "sources", "numbers", "1st try", "lang", "result"],
    results.map((r) => [
      r.case.id,
      `${r.case.posting.slice(0, 2)}→${r.case.profile.slice(-2)}`,
      r.error ?? mark(r, "sources"),
      mark(r, "numbers"),
      mark(r, "firstTry"),
      mark(r, "language"),
      passed(r) ? "PASS" : "FAIL",
    ]),
  );
}

function printTranslateTable(results: TranslateResult[]) {
  console.log("");
  printRows(
    [
      "case",
      "from→to",
      "structure",
      "numbers",
      "style",
      "1st try",
      "lang",
      "result",
    ],
    results.map((r) => [
      r.case.id,
      `${r.case.from}→${r.case.to}`,
      r.error ?? mark(r, "structure"),
      mark(r, "numbers"),
      mark(r, "style"),
      mark(r, "firstTry"),
      mark(r, "language"),
      passed(r) ? "PASS" : "FAIL",
    ]),
  );
}

function printCoverTable(results: CoverResult[]) {
  console.log("");
  printRows(
    ["case", "job→prof", "sources", "numbers", "1st try", "lang", "result"],
    results.map((r) => [
      r.case.id,
      `${r.case.posting.slice(0, 2)}→${r.case.profile.slice(-2)}`,
      r.error ?? mark(r, "sources"),
      mark(r, "numbers"),
      mark(r, "firstTry"),
      mark(r, "language"),
      passed(r) ? "PASS" : "FAIL",
    ]),
  );
}

function printTable(results: CaseResult[]) {
  const rows = results.map((r) => [
    r.case.id,
    `${r.case.posting.slice(0, 2)}→${r.case.profile.slice(-2)}→${r.case.outputLanguage}`,
    r.parsedLanguage ? `${r.parsedLanguage}${mark(r, "parseLanguage")}` : "–",
    r.score === undefined ? (r.error ?? "–") : String(r.score),
    `${r.case.expect.score[0]}–${r.case.expect.score[1]}`,
    mark(r, "score"),
    mark(r, "evidence"),
    mark(r, "firstTry"),
    mark(r, "language"),
    passed(r) ? "PASS" : "FAIL",
  ]);
  printRows(
    [
      "case",
      "job→prof→out",
      "parsed",
      "score",
      "range",
      "in range",
      "evidence",
      "1st try",
      "lang",
      "result",
    ],
    rows,
  );
}

main().catch((error: unknown) => {
  // Error messages can carry prompt text; report the error type only.
  console.error(
    `Eval run crashed (${error instanceof Error ? error.name : typeof error}).`,
  );
  process.exit(2);
});
