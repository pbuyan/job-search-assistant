# Job Search Assistant

An AI assistant for one person's job search. It reads your resume once, then
helps you find relevant postings, see how well you fit each one, tailor your
resume to it without inventing anything, and track every application.

The interface is in English and Canadian French. Resumes and postings can be in
either language, independently of the interface.

## What it does

- **Profile**: import a PDF or DOCX resume. Claude extracts it into a
  structured profile, which you review and edit before saving. The original
  file is kept privately, and only after you save.
- **Jobs**: paste a posting's text or URL, or browse a company's public
  Greenhouse, Lever or Ashby board. Postings are parsed into requirements and
  ranked by similarity to your profile (Voyage embeddings). Imported board
  postings are checked daily and marked closed once they're gone; checking
  one by hand also picks up changes to its text.
- **Fit analysis**: a score with its reasoning: matched requirements with the
  profile bullets that prove them, gaps, and keywords to emphasize.
- **Tailoring**: Claude proposes a resume for one job by reordering, trimming
  and rewording your existing bullets. Every bullet cites the profile bullet it
  came from, and a proposal that cites nothing, or adds a number, is rejected.
  You accept changes in a diff view; the result is saved as a resume version
  and the master profile is never changed.
- **Translation**: an explicit action that creates an English or French copy of
  a resume version. Tailoring never translates.
- **Export**: any resume version as PDF or DOCX. The PDF of the version attached
  to an application is kept as "the file you sent".
- **Tracker**: a Kanban board of applications with dates, next steps, contacts,
  notes and a timeline. Overdue next steps show on the board, the dashboard and
  the sidebar.
- **Cover letters**: an AI draft for an application, written from the profile
  and the fit analysis, with the same rule as tailoring: every claim cites a
  profile bullet. It is a proposal until you use it.
- **Account**: export your profile, or delete your account and every file and
  row that belongs to it.

Each AI call is capped per user per day (`src/lib/ai/quotas.ts`), and every
AI-generated record stores the model and prompt version that produced it.

## Stack

- Next.js 16 (App Router), React 19, TypeScript (strict), pnpm
- Tailwind CSS and shadcn/ui
- Postgres with pgvector on Neon, Drizzle ORM
- Vercel AI SDK with Claude (structured output only), Voyage AI embeddings
- Clerk for authentication, next-intl for English and French
- Vercel Blob (private store) for files
- Vitest and Testing Library, Playwright

## Prerequisites

- Node.js 22 and pnpm 10 (`corepack enable` picks the version pinned in
  `package.json`)
- A Postgres database with the pgvector extension. On Neon, run once in the SQL
  editor before the first migration:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
- A [Clerk](https://clerk.com) application (a development instance is fine)
- An [Anthropic API](https://console.anthropic.com) key
- A [Voyage AI](https://www.voyageai.com) key (or a MongoDB Atlas model API key)
- Optional: a private [Vercel Blob](https://vercel.com/docs/vercel-blob) store.
  Without it the app works, but no files are kept.

## Setup

```bash
pnpm install
cp .env.example .env.local   # then fill it in
pnpm db:migrate              # applies drizzle/ to DATABASE_URL
pnpm dev                     # http://localhost:3000
```

`.env.example` documents every variable. The required ones are `DATABASE_URL`,
`ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY`.

`.env.local` is used by both the app and drizzle-kit, so `pnpm db:migrate`
runs against the database it names. Use a Neon branch for development.

If profiles were saved before job matching existed, or their embedding failed,
`pnpm embed:profiles` embeds them.

## Scripts

| Command            | What it does                                                  |
| ------------------ | ------------------------------------------------------------- |
| `pnpm dev`         | Dev server                                                    |
| `pnpm build`       | Production build                                              |
| `pnpm typecheck`   | `tsc --noEmit`                                                |
| `pnpm lint`        | ESLint                                                        |
| `pnpm test`        | Vitest in watch mode (`pnpm vitest run` for a single run)     |
| `pnpm test:e2e`    | Playwright (starts `pnpm dev` unless `E2E_BASE_URL` is set)   |
| `pnpm i18n:check`  | Every key in `messages/en.json` exists in `fr.json`, and back |
| `pnpm db:generate` | Generates a migration from changes to `src/db/schema.ts`      |
| `pnpm db:migrate`  | Applies pending migrations                                    |
| `pnpm eval`        | Prompt evals with live Claude calls (billed); see below       |

## Tests

**Unit tests** (`src/**/*.test.ts(x)`) mock the database and the models, and
need no secrets.

**Browser tests** (`tests/`) run against `pnpm dev` with the same `.env.local`:

- Without `E2E_CLERK_USER_EMAIL`, only the signed-out specs run.
- With it, the signed-in specs run as that Clerk user, signed in through
  `@clerk/testing`. Use a dedicated test user: the specs overwrite its profile.
- `E2E_AI=1` also runs the paste → analyze → track flow, which makes real
  Claude and Voyage calls.

## Prompt evals

`pnpm eval` runs the real prompts on fixture postings and synthetic profiles,
and checks what must never break: cited bullets exist, no new numbers appear,
the output language is right. Run it before and after any prompt change. See
[`evals/README.md`](evals/README.md).

## Continuous integration

Two GitHub Actions workflows run on pushes to `master` and on pull requests:

- **CI** (`.github/workflows/ci.yml`): typecheck, lint, unit tests, i18n check
  and the production build. It needs no secrets.
- **Playwright Tests** (`.github/workflows/playwright.yml`): migrates a test
  database, then runs the browser tests (never the AI flow). It runs only when
  these repository secrets are set, under Settings → Secrets and variables →
  Actions; otherwise it passes with a notice.

| Secret                  | Value                                                       |
| ----------------------- | ----------------------------------------------------------- |
| `CLERK_PUBLISHABLE_KEY` | Publishable key of the Clerk development instance           |
| `CLERK_SECRET_KEY`      | Secret key of the same instance                             |
| `E2E_CLERK_USER_EMAIL`  | Email of a dedicated test user in that instance             |
| `E2E_DATABASE_URL`      | A database only for tests, e.g. a Neon branch with pgvector |

The workflow migrates `E2E_DATABASE_URL` to the schema of the commit under
test, pull requests included, so don't point it at a database you care about.

## Deployment (Vercel)

1. Import the repository in Vercel and set the variables from `.env.example`.
   For `DATABASE_URL`, use Neon's pooled connection string.
2. Run `pnpm db:migrate` against the production database before deploying a
   change that includes a migration.
3. Create a private Blob store (Storage → Blob, private access) and connect it
   to the project, which sets `BLOB_READ_WRITE_TOKEN`.
4. In the Clerk dashboard, add a webhook endpoint
   `https://<your-domain>/api/webhooks/clerk` for the `user.deleted` event, and
   set its signing secret as `CLERK_WEBHOOK_SIGNING_SECRET`. A user deleted in
   Clerk then has their data erased too.
5. Set `CRON_SECRET` to a long random string. Vercel Cron then calls
   `/api/cron/refresh-jobs` daily (`vercel.json`) to mark imported board
   postings that have closed. It makes no AI calls.
6. Use a Clerk production instance and its keys for the production domain.

## Privacy

Resume and profile content is personal data. It is never logged or sent to
analytics, and error messages never include it. Files are stored in a private
Blob store under per-user keys that never contain file names, and are served
only through routes that check ownership. Deleting an account removes its files
first, then its rows.

## Project layout

```
src/
  app/              routes (App Router); route handlers in app/api/
  components/ui/    shadcn components (generated)
  components/       app components, by feature
  features/         feature logic and Server Actions
  db/               schema.ts, client, and queries (all filtered by userId)
  lib/ai/           model clients, quotas, embeddings
  prompts/          one file per prompt: text, Zod output schema, PROMPT_VERSION
  i18n/             locales and navigation helpers
messages/           en.json (source of truth) and fr.json
drizzle/            generated migrations
evals/              prompt evals and their fixtures
tests/              Playwright specs
```

Contributor conventions, including the AI and privacy rules, are in
[`CLAUDE.md`](CLAUDE.md).
