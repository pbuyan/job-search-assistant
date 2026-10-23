import { VoyageAIError } from "voyageai";
import {
  getProfileForEmbedding,
  setProfileEmbedding,
} from "@/db/queries/profile";
import { consumeQuota } from "@/db/queries/usage";
import { embedDocument, isRateLimited } from "@/lib/ai/embeddings";
import { profileEmbeddingText } from "./profile-text";

export type EmbedProfileResult =
  | "ok"
  | "noProfile"
  | "rateLimited"
  | "failed"
  // The profile changed while embedding; the newer save embeds it.
  | "superseded";

// Embeds the user's current profile with the same model as jobs, so the two
// can be compared. The profile is PII: only the error class and status code
// are logged, never the text or the error body.
export async function embedProfile(
  userId: string,
): Promise<EmbedProfileResult> {
  const profile = await getProfileForEmbedding(userId);
  if (!profile) return "noProfile";
  const text = profileEmbeddingText(profile.data, profile.targetTitles);
  if (!text) return "noProfile";
  // Over the daily cap reads as "busy, try later", like a provider limit.
  if ((await consumeQuota(userId, "embedProfile")) === "exceeded")
    return "rateLimited";

  let embedding: number[];
  try {
    embedding = await embedDocument(text);
  } catch (err) {
    console.error("embedProfile failed", {
      name: err instanceof Error ? err.name : typeof err,
      status: err instanceof VoyageAIError ? err.statusCode : undefined,
    });
    return isRateLimited(err) ? "rateLimited" : "failed";
  }
  return (await setProfileEmbedding(userId, embedding, profile.updatedAt))
    ? "ok"
    : "superseded";
}
