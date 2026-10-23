import { VoyageAIError } from "voyageai";
import { embedDocument, isRateLimited } from "@/lib/ai/embeddings";
import type { BoardPosting } from "./boards/common";
import { parseJob } from "./parse-job";

export type IngestError =
  "parseFailed" | "noRequirements" | "embedFailed" | "embedRateLimited";

// Extracts the posting's fields and requirements, then embeds it for
// matching. Shared by import and by a refreshed posting whose text changed.
// The caller consumes the parseJob quota first.
export async function parseAndEmbed(posting: string) {
  const parsed = await parseJob(posting);
  if (!parsed.ok) return parsed;
  const { job } = parsed.output;
  try {
    const embedding = await embedDocument(
      [job.title, job.company, job.location ?? "", posting]
        .filter(Boolean)
        .join("\n"),
    );
    return { ...parsed, embedding };
  } catch (err) {
    // Status code and error class only; the body can echo the posting text.
    console.error("embedDocument failed", {
      name: err instanceof Error ? err.name : typeof err,
      status: err instanceof VoyageAIError ? err.statusCode : undefined,
    });
    const error: IngestError = isRateLimited(err)
      ? "embedRateLimited"
      : "embedFailed";
    return { ok: false as const, error };
  }
}

type Ingested = Extract<
  Awaited<ReturnType<typeof parseAndEmbed>>,
  { ok: true }
>;

// The job row's posting fields. Board API fields are authoritative; the
// model fills in what they lack. `posting` is the parsed text, stored when
// there's no board description.
export function jobFields(
  ingested: Ingested,
  board: BoardPosting | null,
  posting: string,
) {
  const { job, requirements, language } = ingested.output;
  const salary = board?.salary;
  return {
    company: board?.company || job.company,
    title: board?.title || job.title,
    location: board?.location || job.location || null,
    remote: board?.remote ?? job.remote,
    salaryMin: salary ? salary.min : (job.salaryMin ?? null),
    salaryMax: salary ? salary.max : (job.salaryMax ?? null),
    salaryCurrency: salary ? salary.currency : (job.salaryCurrency ?? null),
    descriptionRaw: board?.description ?? posting,
    requirements,
    requirementsModel: ingested.model,
    requirementsPromptVersion: ingested.promptVersion,
    embedding: ingested.embedding,
    postedAt: board?.postedAt ?? null,
    language: board?.language ?? language,
  };
}
