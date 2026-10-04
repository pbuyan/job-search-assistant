import { VoyageAIClient } from "voyageai";
import { EMBEDDING_DIMS } from "@/db/schema";

// Multilingual, so French and English jobs/profiles share one vector space.
// Profiles must be embedded with this same model for similarity to mean
// anything; changing it means re-embedding everything.
export const EMBEDDING_MODEL = "voyage-4";

// Keys from voyageai.com use the client's default endpoint. MongoDB Atlas
// model API keys only work against MongoDB's, so set
// VOYAGE_BASE_URL=https://ai.mongodb.com/v1 for those.
let client: VoyageAIClient | undefined;
const voyage = () =>
  (client ??= new VoyageAIClient({
    apiKey: process.env.VOYAGE_API_KEY,
    baseUrl: process.env.VOYAGE_BASE_URL || undefined,
  }));

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
