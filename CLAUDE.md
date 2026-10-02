# Job Search Assistant

AI assistant that helps a job seeker find relevant positions, tailor their resume per job, and track applications.

## Stack
- Next.js (App Router), React 19, TypeScript (strict)
- Tailwind CSS + shadcn/ui (components live in `src/components/ui`, installed via the shadcn CLI/MCP — never hand-roll a component shadcn provides)
- Postgres + pgvector, Drizzle ORM (`src/db/schema.ts`)
- Vercel AI SDK + Claude API for all LLM calls
- Zod for every external boundary (forms, API routes, LLM output)
- Vitest + Testing Library (unit), Playwright (e2e)
- Package manager: pnpm

## Commands
- `pnpm dev` — dev server
- `pnpm build` — production build (must pass before a task is done)
- `pnpm lint` / `pnpm typecheck` — run both after any change
- `pnpm test` — Vitest; `pnpm test:e2e` — Playwright
- `pnpm db:generate` — generate migration from schema changes
- `pnpm db:migrate` — apply migrations
- `pnpm eval` — run prompt evals in `evals/`
- Local DB: Docker container `jsa-db` on port 55432 (5432/5433 are taken by local Postgres installs)

## Project layout
```
src/
  app/                 routes (App Router); route handlers in app/api/*
  components/ui/       shadcn components (generated — edit sparingly)
  components/          app components, grouped by feature
  features/            feature modules: profile/, jobs/, tailoring/, tracker/
  db/                  schema.ts, client, queries per feature
  lib/ai/              model clients, shared AI helpers
  prompts/             one file per prompt, exporting prompt + Zod output schema
evals/                 fixture resume/JD pairs + expected-behaviour checks
```

## Conventions
- Server Components by default. Add `"use client"` only for interactivity, and push it as far down the tree as possible.
- Mutations go through Server Actions or route handlers, validated with Zod. Never trust client input.
- Data access only through `src/db/queries/*`; components never import the Drizzle client directly.
- Every query touching user data filters by `userId`. No exceptions.
- Use `cn()` for class merging. No inline `style` unless dynamic values require it.
- Named exports; no default exports except Next.js route files.
- Dates stored as `timestamptz`, rendered in the user's locale.

## AI rules (important)
- **Structured output only.** Every LLM call that feeds the app uses `generateObject` with a Zod schema from `src/prompts/*`. No regex parsing of model text.
- **Never fabricate experience.** Tailoring may reorder, trim, and reword existing content only. Each tailored bullet must carry `sourceBulletId` pointing to a bullet in the master profile; output without a valid source is rejected.
- **Never overwrite the master profile** from an AI step. AI proposes; the user accepts via a diff UI. Tailored resumes are saved as `resume_versions`.
- Fit scores always include reasoning: matched requirements, gaps, and evidence from the profile.
- Prompts are versioned (`PROMPT_VERSION` constant). Store the version with every AI-generated record.
- When changing a prompt, run `pnpm eval` and report before/after.

## Privacy
- Resume and profile content is PII. Never log it, never send it to analytics, never include it in error messages.
- Uploaded files go to private storage with signed URLs only.

## Job sourcing
- Allowed: user-pasted URL/JD, Greenhouse/Lever/Ashby public board APIs, licensed aggregator APIs.
- Not allowed: scraping LinkedIn, Indeed, or any site whose ToS forbids it.

## Definition of done
1. `pnpm typecheck && pnpm lint && pnpm test && pnpm i18n:check` pass
2. UI changes verified in the browser (Playwright MCP) at desktop and mobile widths
3. Schema changes include a generated migration
4. No new `any`, no disabled lint rules without a comment explaining why

## Internationalization
- Locales: `en` (source of truth), `fr` (Canadian wording, e.g. "courriel"). Defined only in `src/i18n/routing.ts`.
- Never hard-code user-facing strings; use next-intl with keys in `messages/*.json`.
- Every key added to `en.json` must be added to `fr.json` in the same change (`pnpm i18n:check`).
- Import `Link`/`useRouter`/`usePathname`/`redirect` from `@/i18n/navigation`, never from `next/link` or `next/navigation` (`notFound` is fine).
- Use ICU for plurals and variables; format dates, numbers, and currency with next-intl formatters.
- DB stores codes (e.g. status `applied`); labels are translated at render time.
- Logical CSS only (`ms-*`/`me-*`/`text-start`), never left/right.
- UI, resume, and job languages are separate (`users.locale`, `profiles.language`/`resume_versions.language`, `jobs.language`); never derive one from another.
- AI prompts stay in English; output language is a parameter; JSON keys stay English.
- Tailoring never translates; translation is an explicit action that creates a new `resume_version`.
- French runs ~20-30% longer; layouts must wrap, not truncate.
