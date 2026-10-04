// pnpm eval [--case <id>] [--concurrency <n>]
//
// Runs the real extraction (parseJob) and fit analysis (analyzeFit) on every
// case in ./cases.ts and checks the posting language, the score range, that
// every evidenceBulletId exists in the profile, that the answer was valid on
// the first attempt, and the language of the explanation. Prints a table and
// exits 1 if any check fails. Full results (including model output) go to
// evals/results/, which is gitignored.
//
// Live Claude calls: every full run costs real tokens.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { z } from "zod";
import type { ParseJobResult } from "@/features/jobs/parse-job";
import { profileDataSchema } from "@/prompts/schemas";
import { CASES, type EvalCase, type PostingId, type ProfileId } from "./cases";
import { checkFit, checkParse, type Check } from "./lib/checks";

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

const passed = (r: CaseResult) => !r.error && r.checks.every((c) => c.pass);

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
      case: { type: "string" },
      concurrency: { type: "string", default: "3" },
    },
  });
  const cases = values.case
    ? CASES.filter((c) => c.id === values.case)
    : CASES;
  if (cases.length === 0) {
    console.error(`Unknown case: ${values.case}`);
    process.exit(2);
  }
  const concurrency = Math.max(1, Number(values.concurrency) || 3);

  const { parseJob } = await import("@/features/jobs/parse-job");
  const { analyzeFit } = await import("@/features/jobs/analyze-fit");
  const { profileBullets, PROMPT_VERSION: fitVersion } = await import(
    "@/prompts/fit-analysis"
  );
  const { PROMPT_VERSION: parseVersion } = await import("@/prompts/parse-job");
  const { MODEL_IDS } = await import("@/lib/ai/models");

  // Each posting is parsed once per run, however many cases use it.
  const parses = new Map<PostingId, Promise<ParseJobResult>>();
  const parse = (id: PostingId) => {
    if (!parses.has(id)) parses.set(id, parseJob(loadPosting(id).text));
    return parses.get(id)!;
  };

  const started = Date.now();
  const results = await pool(cases, concurrency, async (c): Promise<CaseResult> => {
    const parsed = await parse(c.posting);
    if (!parsed.ok) return { case: c, checks: [], error: `parse:${parsed.error}` };
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
  });

  printTable(results);
  const failures = results.filter((r) => !passed(r));
  console.log(
    `\n${results.length - failures.length}/${results.length} passed in ${Math.round((Date.now() - started) / 1000)} s · ${parseVersion} · ${fitVersion} · ${MODEL_IDS.parseJob} / ${MODEL_IDS.fitAnalysis}`,
  );
  for (const r of failures) {
    const reasons = [
      r.error,
      ...r.checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail ?? "failed"}`),
    ].filter(Boolean);
    console.log(`  ✗ ${r.case.id} — ${reasons.join("; ")}`);
    if (r.problems) console.log(`    problems: ${JSON.stringify(r.problems)}`);
  }

  const dir = join(ROOT, "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        promptVersions: { parseJob: parseVersion, fitAnalysis: fitVersion },
        models: MODEL_IDS,
        passed: results.length - failures.length,
        total: results.length,
        results: results.map((r) => ({ ...r, case: r.case.id, pass: passed(r) })),
      },
      null,
      2,
    ),
  );
  console.log(`\nResults: ${file}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

function printTable(results: CaseResult[]) {
  const mark = (r: CaseResult, name: Check["name"]) => {
    const c = r.checks.find((x) => x.name === name);
    if (!c) return "–";
    return c.pass ? (c.warn ? "?" : "✓") : "✗";
  };
  const rows = results.map((r) => [
    r.case.id,
    `${r.case.posting.slice(0, 2)}→${r.case.profile.slice(-2)}→${r.case.outputLanguage}`,
    r.parsedLanguage
      ? `${r.parsedLanguage}${mark(r, "parseLanguage")}`
      : "–",
    r.score === undefined ? (r.error ?? "–") : String(r.score),
    `${r.case.expect.score[0]}–${r.case.expect.score[1]}`,
    mark(r, "score"),
    mark(r, "evidence"),
    mark(r, "firstTry"),
    mark(r, "language"),
    passed(r) ? "PASS" : "FAIL",
  ]);
  const header = [
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
  ];
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i])).join("  ");
  console.log(line(header));
  console.log(widths.map((w) => "─".repeat(w)).join("  "));
  for (const row of rows) console.log(line(row));
  console.log("\n✓ pass  ✗ fail  ? undecided (text too short to detect)  – not run");
}

main().catch((error: unknown) => {
  // Error messages can carry prompt text; report the error type only.
  console.error(
    `Eval run crashed (${error instanceof Error ? error.name : typeof error}).`,
  );
  process.exit(2);
});
