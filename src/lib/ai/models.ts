import { createAnthropic } from "@ai-sdk/anthropic";

// One place to change which Claude model a feature uses. The id is also
// stored with every AI-generated record.
export const MODEL_IDS = {
  parseResume: "claude-opus-5-5",
  parseJob: "claude-opus-5-5",
  fitAnalysis: "claude-opus-5-5",
} as const;

// ANTHROPIC_API_KEY is read from the environment. A user-scoped key (not tied
// to one workspace) is rejected unless the request names the workspace, so
// ANTHROPIC_WORKSPACE_ID is passed through when set.
const provider = createAnthropic({
  headers: process.env.ANTHROPIC_WORKSPACE_ID
    ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
    : undefined,
});

export const parseResumeModel = () => provider(MODEL_IDS.parseResume);
export const parseJobModel = () => provider(MODEL_IDS.parseJob);
export const fitAnalysisModel = () => provider(MODEL_IDS.fitAnalysis);
