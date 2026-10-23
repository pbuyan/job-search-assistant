import { timingSafeEqual } from "node:crypto";
import { listJobsToCheck, markPostingChecked } from "@/db/queries/jobs";
import type { AshbyBoardCache } from "@/features/jobs/boards/ashby";
import { checkPosting } from "@/features/jobs/refresh";

// GET /api/cron/refresh-jobs — run daily by Vercel Cron (vercel.json), which
// sends `Authorization: Bearer $CRON_SECRET`. Marks imported board postings
// that are gone as closed. It makes no AI calls: a changed posting is only
// re-parsed when its user asks (checkJobPosting). Logs counts only.
export const maxDuration = 300;

const BATCH = 100;
const CONCURRENCY = 5;
// A posting is checked at most about once a day.
const RECHECK_AFTER_MS = 20 * 60 * 60 * 1000;

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: Request) {
  if (!authorized(req.headers.get("authorization")))
    return new Response(null, { status: 401 });

  const now = new Date();
  const due = await listJobsToCheck(
    new Date(now.getTime() - RECHECK_AFTER_MS),
    BATCH,
  );
  const counts = { open: 0, closed: 0, unavailable: 0, unsupported: 0 };
  const ashbyBoards: AshbyBoardCache = new Map();

  let next = 0;
  async function worker() {
    while (next < due.length) {
      const job = due[next++];
      try {
        const check = await checkPosting(job, ashbyBoards);
        counts[check.state]++;
        // An unsupported URL is marked checked too, so it doesn't hold the
        // head of the queue every day.
        await markPostingChecked(
          job.userId,
          job.id,
          check.state === "unsupported" ? "unavailable" : check.state,
          now,
        );
      } catch {
        counts.unavailable++;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.info("refresh-jobs", { checked: due.length, ...counts });
  return Response.json({ checked: due.length, ...counts });
}
