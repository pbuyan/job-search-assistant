import { VoyageAIClient, VoyageAIError } from "voyageai";
import { EMBEDDING_DIMS } from "@/db/schema";

// Multilingual, so French and English jobs/profiles share one vector space.
// Profiles must be embedded with this same model for similarity to mean
// anything; changing it means re-embedding everything.
export const EMBEDDING_MODEL = "voyage-4";

// Keys from voyageai.com use the client's default endpoint. MongoDB Atlas
// model API keys only work against MongoDB's, so set
// VOYAGE_BASE_URL=https://ai.mongodb.com/v1 for those.
//
// The SDK retries 429/5xx with exponential backoff (1s, 2s, 4s, …, or the
// Retry-After header). Its default of 2 retries gives up after ~3s, which
// never outlasts a per-minute limit such as the 3 RPM of an account without
// a payment method. 5 retries waits ~31s in all, which fits in the 120s the
// job routes allow alongside the parse step.
export const EMBED_MAX_RETRIES = 5;

let client: VoyageAIClient | undefined;
const voyage = () =>
  (client ??= new VoyageAIClient({
    apiKey: process.env.VOYAGE_API_KEY,
    baseUrl: process.env.VOYAGE_BASE_URL || undefined,
    maxRetries: EMBED_MAX_RETRIES,
  }));

// Still rate limited after every retry: worth telling the user to wait
// rather than reporting a generic failure.
export const isRateLimited = (err: unknown) =>
  err instanceof VoyageAIError && err.statusCode === 429;

// Throws on failure; callers map that to an error code. Over-length input is
// an error rather than silently truncated.
export async function embedDocument(text: string): Promise<number[]> {
  const res = await voyage().embed({
    input: [text],
    model: EMBEDDING_MODEL,
    inputType: "document",
    outputDimension: EMBEDDING_DIMS,
    truncation: false,
  });
  const embedding = res.data?.[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMS) {
    throw new Error("Unexpected embedding shape");
  }
  return embedding;
}
